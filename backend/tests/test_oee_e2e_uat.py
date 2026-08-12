"""End-to-end / UAT integration tests for the OEE pipeline.

Exercises the real path in one rolled-back transaction:

  seed masters → ingest (workbook or import worker) → raw + events + metrics
  → oee_rollup → oee_snapshots → dashboard GET APIs

No schema changes, no Migration 016, no formula/API contract edits.
Outer fixture always rolls back — no leftover production data.

Real Excel rows 5–6 share a business key (last-wins). Combined ~84.48% rollup
uses distinct-key synthetics (M001 + M002) matching approved row fixtures.
"""

from __future__ import annotations

import io
import uuid
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.db.session import get_db, get_engine
from app.main import app
from app.models.downtime_event import DowntimeEvent
from app.models.import_job import ImportJob
from app.models.machine import Machine
from app.models.oee_snapshot import OeeSnapshot
from app.models.plant import Plant
from app.models.production_record import ProductionRecord
from app.models.production_record_metrics import ProductionRecordMetrics
from app.models.rejection_event import RejectionEvent
from app.services.dpr_oee_ingestion import ingest_dpr_oee_workbook
from app.services.import_worker import (
    STATUS_COMMITTED,
    prepare_dpr_oee_import_job,
    run_import_job,
)
from app.services.oee_calculator import calculate_oee_metrics
from app.services.oee_rollup import rollup_machine_day, rollup_plant_day
from tests.auth_helpers import make_auth_headers
from tests.test_dpr_oee_ingestion import (
    REAL_XLSX,
    _row5_cells,
    _row6_cells,
    _seed_masters_for_real_xlsx,
    _seed_second_machine,
    _write_minimal_workbook,
)
from tests.test_oee_calculator import ROW5, ROW5_EXPECTED, ROW6, ROW6_EXPECTED
from tests.test_oee_rollup import ROWS_5_6_EXPECTED_OEE

PROD_DATE = date(2026, 8, 8)

# Approved ratio-of-sums OEE for rows 5+6 retained together (~84.48%)
COMBINED_OEE_APPROX = Decimal("0.844815")


@pytest.fixture
def db_session() -> Session:
    """Session bound to an outer transaction that always rolls back."""
    engine = get_engine()
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, autoflush=False, expire_on_commit=False)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session: Session) -> TestClient:
    """TestClient with get_db overridden and valid auth headers for protected API routes."""
    _, auth_headers = make_auth_headers(db_session, role_code="SUPER_ADMIN")

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        original_get = test_client.get
        original_post = test_client.post

        def _with_auth(method):
            def wrapped(url, *args, **kwargs):
                kwargs_headers = dict(kwargs.pop("headers", {}) or {})
                if not str(url).startswith("/api/v1/auth") and str(url) != "/api/v1/health":
                    kwargs_headers.setdefault("Authorization", auth_headers["Authorization"])
                kwargs["headers"] = kwargs_headers
                return method(url, *args, **kwargs)

            return wrapped

        test_client.get = _with_auth(original_get)
        test_client.post = _with_auth(original_post)
        yield test_client
    app.dependency_overrides.clear()


def _xlsx_bytes(*, rows: list[dict]) -> bytes:
    buf = io.BytesIO()
    _write_minimal_workbook(buf, rows=rows)
    return buf.getvalue()


def _ingest_distinct_rows56(
    session: Session, tmp_path: Path | None = None
) -> tuple[dict[str, object], object]:
    """Seed masters + ingest row5/row6 on distinct machines (both retained)."""
    masters = _seed_masters_for_real_xlsx(session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    _seed_second_machine(session, masters)
    rows = [_row5_cells(machine="M001"), _row6_cells(machine="M002")]
    if tmp_path is not None:
        path = tmp_path / "e2e_rows56.xlsx"
        _write_minimal_workbook(path, rows=rows)
        result = ingest_dpr_oee_workbook(session, path, plant_id=plant.id)
    else:
        result = ingest_dpr_oee_workbook(
            session, _xlsx_bytes(rows=rows), plant_id=plant.id
        )
    return masters, result


def _records_by_qty(
    session: Session, record_ids: list[uuid.UUID]
) -> dict[Decimal, ProductionRecord]:
    records = list(
        session.scalars(
            select(ProductionRecord).where(ProductionRecord.id.in_(record_ids))
        ).all()
    )
    return {r.produced_qty: r for r in records}


def _assert_dashboard_matches_snapshot(
    client: TestClient,
    snap: OeeSnapshot,
) -> None:
    """GET /oee and /oee/breakdown match stored snapshot; MU always null."""
    params = {
        "scope_type": snap.scope_type,
        "scope_id": str(snap.scope_id),
        "period_type": snap.period_type,
        "period_start": snap.period_start.isoformat(),
        "aggregation_rule_version": snap.aggregation_rule_version,
    }
    r = client.get("/api/v1/dashboard/oee", params=params)
    assert r.status_code == 200, r.text
    body = r.json()
    assert Decimal(str(body["availability"])) == pytest.approx(
        snap.availability, abs=Decimal("1e-8")
    )
    assert Decimal(str(body["performance"])) == pytest.approx(
        snap.performance, abs=Decimal("1e-8")
    )
    assert Decimal(str(body["quality"])) == pytest.approx(
        snap.quality, abs=Decimal("1e-8")
    )
    assert Decimal(str(body["oee"])) == pytest.approx(snap.oee, abs=Decimal("1e-8"))
    assert body["machine_utilisation"] is None

    b = client.get("/api/v1/dashboard/oee/breakdown", params=params)
    assert b.status_code == 200, b.text
    bd = b.json()
    assert Decimal(str(bd["oee"])) == pytest.approx(snap.oee, abs=Decimal("1e-8"))
    assert bd["machine_utilisation"] is None
    assert Decimal(str(bd["sum_run_based_capacity"])) == pytest.approx(
        snap.sum_run_based_capacity, abs=Decimal("1e-4")
    )


# ---------------------------------------------------------------------------
# 1–6 + 8: primary E2E path (ingest → metrics → rollup → dashboard)
# ---------------------------------------------------------------------------


def test_e2e_1_ingest_metrics_rollup_dashboard(
    client: TestClient, db_session: Session, tmp_path: Path
) -> None:
    """Full pipeline: distinct-key rows 5+6 → rollup ~84.48% → dashboard parity."""
    masters, result = _ingest_distinct_rows56(db_session, tmp_path)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    m001: Machine = masters["machine"]  # type: ignore[assignment]

    assert result.status == "committed"
    assert result.success_count == 2
    assert result.error_count == 0
    assert len(set(result.production_record_ids)) == 2

    by_qty = _records_by_qty(db_session, result.production_record_ids)
    r5 = by_qty[Decimal("1200")]
    r6 = by_qty[Decimal("1100")]

    # Raw + child events
    for rec, expect_dt, expect_rj in (
        (r5, 1, 5),
        (r6, 1, 1),
    ):
        dt_n = db_session.scalar(
            select(func.count())
            .select_from(DowntimeEvent)
            .where(DowntimeEvent.production_record_id == rec.id)
        )
        rj_n = db_session.scalar(
            select(func.count())
            .select_from(RejectionEvent)
            .where(RejectionEvent.production_record_id == rec.id)
        )
        assert dt_n == expect_dt
        assert rj_n == expect_rj

    m5 = db_session.get(ProductionRecordMetrics, r5.id)
    m6 = db_session.get(ProductionRecordMetrics, r6.id)
    assert m5 is not None and m6 is not None
    assert m5.oee == pytest.approx(Decimal("0.8977272727"), abs=Decimal("1e-8"))
    assert m6.oee == pytest.approx(Decimal("0.7942028985"), abs=Decimal("1e-8"))

    # AF path (not AG) at row level
    assert m5.performance != m5.machine_utilisation
    assert m5.oee == pytest.approx(
        m5.availability * m5.performance * m5.quality, abs=Decimal("1e-8")
    )
    assert m5.oee != pytest.approx(
        m5.availability * m5.machine_utilisation * m5.quality, abs=Decimal("1e-8")
    )

    # Machine-day rollups (each machine has one row)
    snap_m1 = rollup_machine_day(db_session, m001.id, PROD_DATE)
    db_session.flush()
    assert snap_m1 is not None
    assert snap_m1.oee == pytest.approx(m5.oee, abs=Decimal("1e-8"))

    m002 = db_session.scalar(
        select(Machine).where(
            Machine.plant_id == plant.id, Machine.code == "M002"
        )
    )
    assert m002 is not None
    snap_m2 = rollup_machine_day(db_session, m002.id, PROD_DATE)
    db_session.flush()
    assert snap_m2 is not None
    assert snap_m2.oee == pytest.approx(m6.oee, abs=Decimal("1e-8"))

    # Plant-day: both machines → ratio-of-sums (~84.48%), not average of row OEEs
    plant_snap = rollup_plant_day(db_session, plant.id, PROD_DATE)
    db_session.flush()
    assert plant_snap is not None
    assert plant_snap.sum_produced_qty == Decimal("2300")
    assert plant_snap.sum_run_based_capacity == Decimal("2620")  # AF capacity
    assert plant_snap.oee == pytest.approx(ROWS_5_6_EXPECTED_OEE, abs=Decimal("1e-8"))
    assert plant_snap.oee == pytest.approx(COMBINED_OEE_APPROX, abs=Decimal("1e-6"))

    avg_row_oee = (m5.oee + m6.oee) / Decimal("2")
    assert plant_snap.oee != pytest.approx(avg_row_oee, abs=Decimal("1e-8"))

    # AG-style plant capacity would be 2700 — must not match AF path
    ag_capacity = Decimal("2700")
    ag_p = Decimal("2300") / ag_capacity
    assert plant_snap.performance != pytest.approx(ag_p, abs=Decimal("1e-8"))
    assert plant_snap.performance == pytest.approx(
        Decimal("2300") / Decimal("2620"), abs=Decimal("1e-8")
    )

    _assert_dashboard_matches_snapshot(client, plant_snap)
    _assert_dashboard_matches_snapshot(client, snap_m1)

    # machines listing for plant day
    machines_resp = client.get(
        "/api/v1/dashboard/oee/machines",
        params={
            "plant_id": str(plant.id),
            "period_type": "day",
            "period_start": PROD_DATE.isoformat(),
        },
    )
    assert machines_resp.status_code == 200
    items = machines_resp.json()["items"]
    assert len(items) == 2
    assert all(i["machine_utilisation"] is None for i in items)

    plants_resp = client.get(
        "/api/v1/dashboard/oee/plants",
        params={
            "period_type": "day",
            "period_start": PROD_DATE.isoformat(),
        },
    )
    assert plants_resp.status_code == 200
    plant_ids = {i["scope_id"] for i in plants_resp.json()["items"]}
    assert str(plant.id) in plant_ids


def test_e2e_2_real_xlsx_last_wins_documented(db_session: Session) -> None:
    """Real sample rows 5–6 share business key → one record (row 6 last-wins).

    Combined 84.48% requires distinct keys (covered in test_e2e_1).
    """
    assert REAL_XLSX.exists()
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]

    result = ingest_dpr_oee_workbook(db_session, REAL_XLSX, plant_id=plant.id)
    assert result.status == "committed"
    assert result.success_count == 2
    distinct = set(result.production_record_ids)
    assert len(distinct) == 1

    rec = db_session.get(ProductionRecord, next(iter(distinct)))
    assert rec is not None
    assert rec.produced_qty == Decimal("1100")  # row 6 wins
    assert rec.planned_downtime_min == Decimal("30")

    metrics = db_session.get(ProductionRecordMetrics, rec.id)
    assert metrics is not None
    assert metrics.oee == pytest.approx(Decimal("0.7942028985"), abs=Decimal("1e-8"))

    machine: Machine = masters["machine"]  # type: ignore[assignment]
    snap = rollup_machine_day(db_session, machine.id, PROD_DATE)
    db_session.flush()
    assert snap is not None
    # Only last-wins row retained — not the dual-row combined rollup
    assert snap.sum_produced_qty == Decimal("1100")
    assert snap.oee == pytest.approx(metrics.oee, abs=Decimal("1e-8"))
    assert snap.oee != pytest.approx(COMBINED_OEE_APPROX, abs=Decimal("1e-4"))


def test_e2e_3_import_worker_bytes_path(
    client: TestClient, db_session: Session
) -> None:
    """Same E2E via prepare + run_import_job(file_bytes) instead of direct ingest."""
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    _seed_second_machine(db_session, masters)
    content = _xlsx_bytes(
        rows=[_row5_cells(machine="M001"), _row6_cells(machine="M002")]
    )
    job = prepare_dpr_oee_import_job(db_session, plant_id=plant.id)
    worker = run_import_job(db_session, job.id, file_bytes=content)
    db_session.flush()

    assert worker.executed is True
    assert worker.status == STATUS_COMMITTED
    assert worker.success_count == 2
    assert len(set(worker.production_record_ids)) == 2

    plant_snap = rollup_plant_day(db_session, plant.id, PROD_DATE)
    db_session.flush()
    assert plant_snap is not None
    assert plant_snap.oee == pytest.approx(COMBINED_OEE_APPROX, abs=Decimal("1e-6"))
    _assert_dashboard_matches_snapshot(client, plant_snap)

    refreshed = db_session.get(ImportJob, job.id)
    assert refreshed is not None
    assert refreshed.status == STATUS_COMMITTED


# ---------------------------------------------------------------------------
# 7: empty / null dashboard states
# ---------------------------------------------------------------------------


def test_e2e_4_dashboard_empty_and_null_states(
    client: TestClient, db_session: Session
) -> None:
    """No snapshot → 404; empty trend → []; MU always null when present."""
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    machine: Machine = masters["machine"]  # type: ignore[assignment]

    missing = client.get(
        "/api/v1/dashboard/oee",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
            "period_type": "day",
            "period_start": PROD_DATE.isoformat(),
        },
    )
    assert missing.status_code == 404

    trend = client.get(
        "/api/v1/dashboard/oee/trend",
        params={
            "scope_type": "plant",
            "scope_id": str(plant.id),
            "period_type": "day",
            "period_start_from": PROD_DATE.isoformat(),
            "period_start_to": PROD_DATE.isoformat(),
        },
    )
    assert trend.status_code == 200
    assert trend.json()["items"] == []
    assert trend.json()["count"] == 0

    # Seed one complete day then confirm NULL MU on API (never invented)
    result = ingest_dpr_oee_workbook(
        db_session, _xlsx_bytes(rows=[_row5_cells()]), plant_id=plant.id
    )
    assert result.success_count == 1
    snap = rollup_machine_day(db_session, machine.id, PROD_DATE)
    db_session.flush()
    assert snap is not None
    resp = client.get(
        "/api/v1/dashboard/oee",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
            "period_type": "day",
            "period_start": PROD_DATE.isoformat(),
        },
    )
    assert resp.status_code == 200
    assert resp.json()["machine_utilisation"] is None


# ---------------------------------------------------------------------------
# 9: idempotent re-ingest
# ---------------------------------------------------------------------------


def test_e2e_5_idempotent_reingest(db_session: Session, tmp_path: Path) -> None:
    """Second ingest upserts same production_records; no duplicate events."""
    masters, first = _ingest_distinct_rows56(db_session, tmp_path)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    ids_first = set(first.production_record_ids)
    count_pr = db_session.scalar(
        select(func.count())
        .select_from(ProductionRecord)
        .where(ProductionRecord.plant_id == plant.id)
    )
    count_dt = db_session.scalar(select(func.count()).select_from(DowntimeEvent))
    count_rj = db_session.scalar(select(func.count()).select_from(RejectionEvent))

    path = tmp_path / "e2e_rows56.xlsx"
    second = ingest_dpr_oee_workbook(db_session, path, plant_id=plant.id)
    assert second.success_count == 2
    assert set(second.production_record_ids) == ids_first

    assert (
        db_session.scalar(
            select(func.count())
            .select_from(ProductionRecord)
            .where(ProductionRecord.plant_id == plant.id)
        )
        == count_pr
        == 2
    )
    assert (
        db_session.scalar(select(func.count()).select_from(DowntimeEvent)) == count_dt
    )
    assert (
        db_session.scalar(select(func.count()).select_from(RejectionEvent)) == count_rj
    )

    # Rollup still ~84.48% after re-ingest
    plant_snap = rollup_plant_day(db_session, plant.id, PROD_DATE)
    db_session.flush()
    assert plant_snap is not None
    assert plant_snap.oee == pytest.approx(COMBINED_OEE_APPROX, abs=Decimal("1e-6"))


# ---------------------------------------------------------------------------
# 10: Q1 incomplete excluded from rollup (no +24h invent)
# ---------------------------------------------------------------------------


def test_e2e_6_q1_incomplete_excluded_from_rollup(
    db_session: Session, tmp_path: Path
) -> None:
    """stop < start → NULL time metrics; rollup excludes without inventing +24h."""
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    machine: Machine = masters["machine"]  # type: ignore[assignment]
    _seed_second_machine(db_session, masters)

    path = tmp_path / "e2e_q1.xlsx"
    _write_minimal_workbook(
        path,
        rows=[
            _row5_cells(machine="M001"),
            {
                "B": datetime(2026, 8, 8),
                "C": "A",
                "D": "M002",
                "E": time(22, 0),
                "F": time(6, 0),  # stop < start — Q1 TBC, no +24h
                "H": "ABC",
                "I": "RGP",
                "J": "PD001",
                "K": 2,
                "L": 60,
                "N": 1100,
                "O": 30,
                "S": 20,
                "AM": 4,
            },
        ],
    )
    result = ingest_dpr_oee_workbook(db_session, path, plant_id=plant.id)
    assert result.success_count == 2

    by_qty = _records_by_qty(db_session, result.production_record_ids)
    r5 = by_qty[Decimal("1200")]
    overnight = by_qty[Decimal("1100")]
    assert overnight.stop_at < overnight.start_at

    m_over = db_session.get(ProductionRecordMetrics, overnight.id)
    assert m_over is not None
    assert m_over.run_time_min is None
    assert m_over.available_time_min is None
    assert m_over.oee is None

    calc = calculate_oee_metrics(
        start_at=overnight.start_at,
        stop_at=overnight.stop_at,
        cavity_count=overnight.cavity_count,
        cycle_time_sec=overnight.cycle_time_sec,
        produced_qty=overnight.produced_qty,
        planned_downtime_min=overnight.planned_downtime_min,
        downtime_minutes=[Decimal("20")],
        rejection_qtys=[Decimal("4")],
    )
    assert calc.q1_midnight_unresolved is True

    # Plant rollup includes only complete row5 — not repaired overnight
    plant_snap = rollup_plant_day(db_session, plant.id, PROD_DATE)
    db_session.flush()
    assert plant_snap is not None
    assert plant_snap.sum_produced_qty == Decimal("1200")
    assert plant_snap.oee == pytest.approx(ROW5_EXPECTED["oee"], abs=Decimal("1e-8"))

    snap_m1 = rollup_machine_day(db_session, machine.id, PROD_DATE)
    db_session.flush()
    assert snap_m1 is not None
    assert snap_m1.sum_produced_qty == r5.produced_qty

    m002 = db_session.scalar(
        select(Machine).where(Machine.plant_id == plant.id, Machine.code == "M002")
    )
    assert m002 is not None
    snap_m2 = rollup_machine_day(db_session, m002.id, PROD_DATE)
    db_session.flush()
    # Incomplete-only machine day → no snapshot written (NULL policy)
    assert snap_m2 is None


def test_e2e_7_zero_produced_null_ratios_still_roll_components(
    db_session: Session, tmp_path: Path
) -> None:
    """Zero produced → row quality/oee NULL; rollup still sums complete components.

    Rollup completeness checks run/available/target/produced/rejection NULLs only
    (produced=0 is not NULL). Do not invent an exclusion rule for zero qty.
    """
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    _seed_second_machine(db_session, masters)

    path = tmp_path / "e2e_null_q.xlsx"
    _write_minimal_workbook(
        path,
        rows=[
            _row5_cells(machine="M001"),
            {
                "B": datetime(2026, 8, 8),
                "C": "A",
                "D": "M002",
                "E": time(8, 30),
                "F": time(20, 30),
                "H": "ABC",
                "I": "RGP",
                "J": "PD001",
                "K": 2,
                "L": 60,
                "N": 0,  # produced 0 → quality/oee undefined at row metrics
                "O": 60,
            },
        ],
    )
    result = ingest_dpr_oee_workbook(db_session, path, plant_id=plant.id)
    assert result.success_count == 2

    zero_rec = next(
        r
        for r in db_session.scalars(
            select(ProductionRecord).where(
                ProductionRecord.id.in_(result.production_record_ids)
            )
        )
        if r.produced_qty == Decimal("0")
    )
    zm = db_session.get(ProductionRecordMetrics, zero_rec.id)
    assert zm is not None
    assert zm.quality is None
    assert zm.oee is None
    assert zm.rejection_ppm is None
    assert zm.run_time_min is not None
    assert zm.available_time_min is not None

    plant_snap = rollup_plant_day(db_session, plant.id, PROD_DATE)
    db_session.flush()
    assert plant_snap is not None
    # Both rows contribute components; qty sum still 1200 but capacity diluted
    assert plant_snap.sum_produced_qty == Decimal("1200")
    assert plant_snap.sum_run_based_capacity == (
        Decimal("1280") + zm.run_time_min / Decimal("60") * Decimal("120")
    )
    assert plant_snap.oee != pytest.approx(ROW5_EXPECTED["oee"], abs=Decimal("1e-4"))
    # Row-level NULL ratios must not be coerced onto the snapshot (ratios recomputed)
    assert plant_snap.quality is not None
    assert plant_snap.oee is not None


def test_e2e_8_row_metric_excel_parity_anchors(db_session: Session) -> None:
    """Sanity: ingested metrics match approved calculator fixtures (AF path)."""
    masters, result = _ingest_distinct_rows56(db_session)
    by_qty = _records_by_qty(db_session, result.production_record_ids)
    m5 = db_session.get(ProductionRecordMetrics, by_qty[Decimal("1200")].id)
    m6 = db_session.get(ProductionRecordMetrics, by_qty[Decimal("1100")].id)
    assert m5 is not None and m6 is not None

    calc5 = calculate_oee_metrics(**ROW5)
    calc6 = calculate_oee_metrics(**ROW6)
    # DB Numeric scale may round ratios; compare with Excel-approved anchors
    assert m5.availability == pytest.approx(calc5.availability, abs=Decimal("1e-8"))
    assert m5.performance == pytest.approx(calc5.performance, abs=Decimal("1e-8"))
    assert m5.quality == pytest.approx(calc5.quality, abs=Decimal("1e-8"))
    assert m5.oee == pytest.approx(calc5.oee, abs=Decimal("1e-8"))
    assert m5.oee == pytest.approx(ROW5_EXPECTED["oee"], abs=Decimal("1e-8"))
    assert m6.oee == pytest.approx(calc6.oee, abs=Decimal("1e-8"))
    assert m6.oee == pytest.approx(ROW6_EXPECTED["oee"], abs=Decimal("1e-8"))
    assert m5.performance != m5.machine_utilisation
    assert m6.performance != m6.machine_utilisation
    assert m5.oee == pytest.approx(
        m5.availability * m5.performance * m5.quality, abs=Decimal("1e-7")
    )

# ---------------------------------------------------------------------------
# Leftover gate (separate connection sees committed DB only)
# ---------------------------------------------------------------------------


def test_e2e_9_no_leftover_operational_rows(db_session: Session, tmp_path: Path) -> None:
    """Inside txn data exists; uncommitted outer rollback → live DB stays clean."""
    masters, result = _ingest_distinct_rows56(db_session, tmp_path)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    assert result.success_count == 2
    rollup_plant_day(db_session, plant.id, PROD_DATE)
    db_session.flush()

    assert db_session.scalar(select(func.count()).select_from(ProductionRecord)) >= 2
    assert db_session.scalar(select(func.count()).select_from(OeeSnapshot)) >= 1

    engine = get_engine()
    with engine.connect() as conn:
        for table in (
            "import_jobs",
            "import_job_rows",
            "production_records",
            "production_record_metrics",
            "downtime_events",
            "rejection_events",
            "oee_snapshots",
        ):
            count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            assert count == 0, f"{table} visible without commit, count={count}"


def test_e2e_10_live_db_leftover_gate(db_session: Session) -> None:
    """Post-suite style gate: committed operational leftovers must be 0."""
    _ = db_session
    engine = get_engine()
    with engine.connect() as conn:
        for table in (
            "production_records",
            "production_record_metrics",
            "downtime_events",
            "rejection_events",
            "oee_snapshots",
            "import_jobs",
            "import_job_rows",
        ):
            count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            assert count == 0, f"expected 0 leftover rows in {table}, got {count}"
