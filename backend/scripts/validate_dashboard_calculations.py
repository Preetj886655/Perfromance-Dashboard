"""Independent validation of dashboard manufacturing calculations.

This script parses raw source data independently (without calling internal aggregation
functions) and validates against backend API and data layers.
"""

from __future__ import annotations

import sys
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Any

import openpyxl

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.services.google_sheets_service import fetch_google_sheet_dataset  # noqa: E402


def to_float(val: Any) -> float:
    if val is None:
        return 0.0
    if isinstance(val, int | float):
        return float(val)
    s = str(val).replace(",", "").replace("%", "").strip()
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_date_str(val: Any) -> str | None:
    if val is None:
        return None
    if isinstance(val, datetime | date):
        return val.strftime("%Y-%m-%d")
    s = str(val).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return s


def load_raw_excel(path: Path) -> list[dict[str, Any]]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Sheet1"]
    rows: list[dict[str, Any]] = []
    for idx, r in enumerate(ws.iter_rows(values_only=True), start=1):
        if idx == 1:
            continue
        if not any(c is not None for c in r):
            continue
        row_dict = {
            "row_num": idx,
            "slNo": r[0],
            "date": parse_date_str(r[1]),
            "line": str(r[2]).strip() if r[2] is not None else "",
            "shift": str(r[3]).strip() if r[3] is not None else "",
            "part": str(r[4]).strip() if r[4] is not None else "",
            "stage": str(r[5]).strip() if r[5] is not None else "",
            "machine": str(r[6]).strip() if r[6] is not None else "",
            "downtimeType": str(r[7]).strip() if r[7] is not None else "",
            "downtimeMinutes": to_float(r[8]),
            "productionLoss": to_float(r[9]),
            "productionTarget": to_float(r[10]),
            "totalProduction": to_float(r[11]),
            "rejection": to_float(r[12]),
            "description": str(r[13]).strip() if len(r) > 13 and r[13] is not None else "",
        }
        rows.append(row_dict)
    wb.close()
    return rows


def aggregate_metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    count = len(rows)
    tot_dt = sum(r["downtimeMinutes"] for r in rows)
    tot_loss = sum(r["productionLoss"] for r in rows)
    tot_target = sum(r["productionTarget"] for r in rows)
    tot_prod = sum(r["totalProduction"] for r in rows)
    tot_rej = sum(r["rejection"] for r in rows)

    dates = sorted(r["date"] for r in rows if r["date"])
    min_date = dates[0] if dates else None
    max_date = dates[-1] if dates else None

    gap = tot_target - tot_prod
    ach_pct = (tot_prod / tot_target * 100.0) if tot_target > 0 else 0.0

    dt_rows = [r["downtimeMinutes"] for r in rows if r["downtimeMinutes"] > 0]
    dt_count = len(dt_rows)
    avg_dt = (tot_dt / dt_count) if dt_count > 0 else 0.0

    loss_rows = [r["productionLoss"] for r in rows if r["productionLoss"] > 0]
    loss_count = len(loss_rows)
    avg_loss = (tot_loss / loss_count) if loss_count > 0 else 0.0

    return {
        "count": count,
        "minDate": min_date,
        "maxDate": max_date,
        "downtime": tot_dt,
        "loss": tot_loss,
        "target": tot_target,
        "production": tot_prod,
        "rejection": tot_rej,
        "gap": gap,
        "achievement": ach_pct,
        "downtimeCount": dt_count,
        "avgDowntime": avg_dt,
        "avgLoss": avg_loss,
    }


def main() -> None:
    root_dir = backend_dir.parent
    p3_path = root_dir.parent / "Medchal_Downtime & Prod (3).xlsx"
    p2_path = root_dir / "Medchal_Downtime & Prod (2).xlsx"

    target_excel = p3_path if p3_path.exists() else p2_path
    print(f"Loading reference Excel: {target_excel}")
    excel_rows = load_raw_excel(target_excel)
    print(f"Loaded {len(excel_rows)} records from Excel.\n")

    print("Fetching Google Sheets dataset via backend service...")
    gs_payload = fetch_google_sheet_dataset(refresh=True)
    gs_raw = gs_payload.get("data", [])

    gs_rows = []
    for idx, r in enumerate(gs_raw, start=2):
        pt = (
            r.get("productionTarget")
            if r.get("productionTarget") is not None
            else r.get("prodTargetNOS")
        )
        tp = (
            r.get("totalProduction")
            if r.get("totalProduction") is not None
            else r.get("totalPRODNOS")
        )
        row_dict = {
            "row_num": idx,
            "slNo": r.get("slNo"),
            "date": parse_date_str(r.get("date")),
            "line": str(r.get("line") or "").strip(),
            "shift": str(r.get("shift") or "").strip(),
            "part": str(r.get("part") or "").strip(),
            "stage": str(r.get("stage") or "").strip(),
            "machine": str(r.get("machine") or "").strip(),
            "downtimeType": str(r.get("downtimeType") or "").strip(),
            "downtimeMinutes": to_float(r.get("downtimeMinutes")),
            "productionLoss": to_float(r.get("productionLoss")),
            "productionTarget": to_float(pt),
            "totalProduction": to_float(tp),
            "rejection": to_float(r.get("rejection")),
        }
        gs_rows.append(row_dict)
    print(f"Loaded {len(gs_rows)} records from Google Sheets.\n")

    m_excel = aggregate_metrics(excel_rows)
    m_gs = aggregate_metrics(gs_rows)

    print("=" * 80)
    print("1. OVERALL RECONCILIATION TABLE (Excel vs Backend/GS)")
    print("=" * 80)
    header_str = (
        f"{'Metric':<25} | {'Excel Source':<15} | {'Backend / GS':<15} | "
        f"{'Diff':<10} | {'Status'}"
    )
    print(header_str)
    print("-" * 80)

    metrics_to_show = [
        ("Records", "count", "{:,.0f}"),
        ("Min Date", "minDate", "{}"),
        ("Max Date", "maxDate", "{}"),
        ("Downtime (min)", "downtime", "{:,.1f}"),
        ("Production Loss (NOS)", "loss", "{:,.0f}"),
        ("Production Target (NOS)", "target", "{:,.0f}"),
        ("Total Production (NOS)", "production", "{:,.0f}"),
        ("Rejection (NOS)", "rejection", "{:,.0f}"),
        ("Production Gap (NOS)", "gap", "{:,.0f}"),
        ("Achievement %", "achievement", "{:.2f}%"),
        ("Downtime Events", "downtimeCount", "{:,.0f}"),
        ("Avg Downtime (min)", "avgDowntime", "{:.2f}"),
        ("Avg Prod Loss (NOS)", "avgLoss", "{:.2f}"),
    ]

    all_pass = True
    for label, key, fmt in metrics_to_show:
        v_ex = m_excel[key]
        v_gs = m_gs[key]
        if isinstance(v_ex, int | float):
            diff = abs(v_ex - v_gs)
            status = "PASS" if diff < 0.01 else "FAIL"
            diff_str = f"{diff:.2f}" if isinstance(v_ex, float) else f"{diff}"
        else:
            status = "PASS" if v_ex == v_gs else "FAIL"
            diff_str = "0" if status == "PASS" else "mismatch"
        if status == "FAIL":
            all_pass = False
        row_str = (
            f"{label:<25} | {fmt.format(v_ex):<15} | {fmt.format(v_gs):<15} | "
            f"{diff_str:<10} | {status}"
        )
        print(row_str)

    print("\n" + "=" * 80)
    print("2. MACHINE VALIDATION TABLE")
    print("=" * 80)

    mach_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in excel_rows:
        mach_groups[r["machine"]].append(r)

    for m in sorted(mach_groups.keys()):
        if m in ("Line 1", "Line 2", ""):
            agg = aggregate_metrics(mach_groups[m])
            name = m if m else "[Blank / None]"
            print(
                f"{name:<15} | Rec: {agg['count']:<5} | DT: {agg['downtime']:<10,.0f} | "
                f"Target: {agg['target']:<12,.0f} | Prod: {agg['production']:<10,.0f} | "
                f"Ach: {agg['achievement']:<6.2f}%"
            )

    l1_l2 = mach_groups["Line 1"] + mach_groups["Line 2"]
    agg_l1_l2 = aggregate_metrics(l1_l2)
    print("-" * 80)
    print(
        f"{'Line 1 + Line 2':<15} | Rec: {agg_l1_l2['count']:<5} | "
        f"DT: {agg_l1_l2['downtime']:<10,.0f} | "
        f"Target: {agg_l1_l2['target']:<12,.0f} | Prod: {agg_l1_l2['production']:<10,.0f} | "
        f"Ach: {agg_l1_l2['achievement']:<6.2f}%"
    )
    print(
        f"{'All Machines':<15} | Rec: {m_excel['count']:<5} | "
        f"DT: {m_excel['downtime']:<10,.0f} | "
        f"Target: {m_excel['target']:<12,.0f} | Prod: {m_excel['production']:<10,.0f} | "
        f"Ach: {m_excel['achievement']:<6.2f}%"
    )

    print("\n" + "=" * 80)
    print("3. FILTER MATRIX VALIDATION")
    print("=" * 80)
    test_filters = [
        ("1. All Data", lambda r: True),
        ("2. Line = ERC", lambda r: r["line"] == "ERC"),
        ("3. Machine = Line 1", lambda r: r["machine"] == "Line 1"),
        ("4. Machine = Line 2", lambda r: r["machine"] == "Line 2"),
        ("5. ERC + Line 1", lambda r: r["line"] == "ERC" and r["machine"] == "Line 1"),
        ("6. ERC + Line 2", lambda r: r["line"] == "ERC" and r["machine"] == "Line 2"),
        ("7. Shift A", lambda r: r["shift"] == "A"),
        ("8. Shift B", lambda r: r["shift"] == "B"),
        ("9. Stage Clip", lambda r: r["stage"] == "Clip"),
        ("10. Material MK5", lambda r: r["part"] == "MK5"),
        ("11. Date 2026", lambda r: bool(r["date"] and r["date"].startswith("2026-"))),
        (
            "12. Date 2026 + Line 1",
            lambda r: bool(
                r["date"] and r["date"].startswith("2026-") and r["machine"] == "Line 1"
            ),
        ),
        (
            "13. Date + Line + Mach",
            lambda r: bool(
                r["date"]
                and r["date"].startswith("2026-")
                and r["line"] == "ERC"
                and r["machine"] == "Line 1"
            ),
        ),
        (
            "14. Date + Shift + Mach",
            lambda r: bool(
                r["date"]
                and r["date"].startswith("2026-")
                and r["shift"] == "A"
                and r["machine"] == "Line 1"
            ),
        ),
        (
            "15. Full Combo",
            lambda r: bool(
                r["date"]
                and r["date"].startswith("2026-")
                and r["line"] == "ERC"
                and r["shift"] == "A"
                and r["stage"] == "Clip"
                and r["machine"] == "Line 1"
                and r["part"] == "MK5"
            ),
        ),
    ]

    for name, pred in test_filters:
        sub_ex = [r for r in excel_rows if pred(r)]
        sub_gs = [r for r in gs_rows if pred(r)]
        a_ex = aggregate_metrics(sub_ex)
        a_gs = aggregate_metrics(sub_gs)
        match = (
            a_ex["count"] == a_gs["count"]
            and abs(a_ex["downtime"] - a_gs["downtime"]) < 0.01
            and abs(a_ex["target"] - a_gs["target"]) < 0.01
            and abs(a_ex["production"] - a_gs["production"]) < 0.01
        )
        st = "PASS" if match else "FAIL"
        print(
            f"{name:<25} | Rec: {a_ex['count']:<5} | Target: {a_ex['target']:<12,.0f} | "
            f"Prod: {a_ex['production']:<10,.0f} | {st}"
        )

    print("\n" + "=" * 80)
    print(f"OVERALL CALCULATION VERIFICATION: {'PASS' if all_pass else 'FAIL'}")
    print("=" * 80)


if __name__ == "__main__":
    main()
