"""Integration tests for DPR_OEE CSV ingestion (service layer) — CSV Import Phase 1.

Uses Compose Postgres (127.0.0.1:5433 / pril_analytics) inside a rolled-back
transaction so no temporary masters/production/import rows remain.

Mirrors the equivalent Excel-path assertions in test_dpr_oee_ingestion.py
(same masters, same synthetic row shapes) so the two ingestion paths are
tested for parity, not with a separate/weaker CSV validation story.
"""

from __future__ import annotations

import io
import uuid
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_engine
from app.models.downtime_event import DowntimeEvent
from app.models.import_job import ImportJob
from app.models.import_job_row import ImportJobRow
from app.models.production_record import ProductionRecord
from app.models.production_record_metrics import ProductionRecordMetrics
from app.models.rejection_event import RejectionEvent
from app.services.dpr_oee_ingestion import (
    DATA_START_ROW,
    DOWNTIME_COLUMNS,
    HEADER_ROW,
    REJECTION_COLUMNS,
    SUBHEADER_ROW,
    ingest_dpr_oee_csv,
    ingest_dpr_oee_workbook,
)
from tests.test_dpr_oee_ingestion import (
    _row5_cells,
    _row6_cells,
    _seed_masters_for_real_xlsx,
    _seed_second_machine,
    _write_minimal_workbook,
)

_A_TO_Z = [chr(c) for c in range(ord("A"), ord("Z") + 1)]
_AA_TO_AZ = [f"A{chr(c)}" for c in range(ord("A"), ord("Z") + 1)]
_ALL_COLUMNS = _A_TO_Z + _AA_TO_AZ  # A..Z, AA..AZ — covers up to AQ used here


@pytest.fixture
def db_session() -> Session:
    """Session bound to an outer transaction that always rolls back.

    Locally defined (not imported) to match the convention every other test
    file in this suite uses (test_dpr_oee_api.py, test_dpr_oee_ingestion.py).
    """
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


def _write_minimal_csv(*, rows: list[dict], row3_overrides: dict | None = None) -> bytes:
    """Build a DPR_OEE-shaped CSV: 2 title rows, headers row 3, sub-headers
    row 4, data from row 5 — same layout ``_write_minimal_workbook`` builds
    for Excel, just serialized as CSV text instead of a workbook.
    """
    headers = {
        "A": "S.No.",
        "B": "Date",
        "C": "Shift",
        "D": "Machine Name/No.",
        "E": "Start Time",
        "F": "Stop Time",
        "H": "Operator Name",
        "I": "Part Name ",
        "J": "Part No.",
        "K": "Cavity",
        "L": "Cycle Time (Sec.)",
        "N": "Prod. Qty. (Pcs.)",
        "O": "Planned Down Time (Tea/Lunch)",
    }
    if row3_overrides:
        headers.update(row3_overrides)

    grid: dict[int, dict[str, str]] = {1: {"A": "PATIL RAIL INFRASTRUCTURE PVT. LTD."}, 2: {}}
    grid[HEADER_ROW] = dict(headers)
    grid[SUBHEADER_ROW] = {}
    for letter, code, label in DOWNTIME_COLUMNS:
        grid[SUBHEADER_ROW][letter] = f"{code}. {label}"
    for letter, code in REJECTION_COLUMNS:
        grid[SUBHEADER_ROW][letter] = f"{code}. Reason"

    for i, row in enumerate(rows):
        r = DATA_START_ROW + i
        grid[r] = {}
        for col, val in row.items():
            if val is None:
                continue
            if hasattr(val, "isoformat"):
                grid[r][col] = val.isoformat()
            else:
                grid[r][col] = str(val)

    max_row = max(grid.keys())
    buf = io.StringIO()
    import csv as csv_module

    writer = csv_module.writer(buf, lineterminator="\r\n")
    for r in range(1, max_row + 1):
        row_dict = grid.get(r, {})
        max_col_idx = max((_ALL_COLUMNS.index(c) for c in row_dict), default=-1)
        line = [row_dict.get(_ALL_COLUMNS[i], "") for i in range(max_col_idx + 1)]
        writer.writerow(line)
    return buf.getvalue().encode("utf-8")


# --- happy path: two distinct business keys, full downtime/rejection parity ---


def test_csv_happy_path_distinct_keys_and_source_type(
    db_session: Session, tmp_path: object
) -> None:
    del tmp_path
    masters = _seed_masters_for_real_xlsx(db_session)
    plant = masters["plant"]
    _seed_second_machine(db_session, masters)

    content = _write_minimal_csv(
        rows=[_row5_cells(machine="M001"), _row6_cells(machine="M002")]
    )
    result = ingest_dpr_oee_csv(db_session, content, plant_id=plant.id)

    assert result.status == "committed"
    assert result.success_count == 2
    assert result.error_count == 0
    assert len(set(result.production_record_ids)) == 2

    job = db_session.get(ImportJob, result.import_job_id)
    assert job is not None
    assert job.source_type == "csv"

    records = list(
        db_session.scalars(
            select(ProductionRecord).where(
                ProductionRecord.id.in_(result.production_record_ids)
            )
        ).all()
    )
    assert len(records) == 2
    for rec in records:
        assert rec.source_type == "csv"
        assert rec.source_import_id == result.import_job_id
        assert rec.external_row_key and rec.external_row_key.startswith("dpr_oee:")

    by_qty = {r.produced_qty: r for r in records}
    r5 = by_qty[Decimal("1200")]
    r6 = by_qty[Decimal("1100")]
    assert r5.planned_downtime_min == Decimal("60")
    assert r6.planned_downtime_min == Decimal("30")
    assert r5.cavity_count == Decimal("2")

    dt5 = list(
        db_session.scalars(
            select(DowntimeEvent).where(DowntimeEvent.production_record_id == r5.id)
        ).all()
    )
    assert len(dt5) == 1 and dt5[0].minutes == Decimal("20")

    rj6 = list(
        db_session.scalars(
            select(RejectionEvent).where(RejectionEvent.production_record_id == r6.id)
        ).all()
    )
    assert len(rj6) == 1 and rj6[0].qty == Decimal("4")

    m5 = db_session.get(ProductionRecordMetrics, r5.id)
    assert m5 is not None
    assert m5.oee is not None


# --- CSV-specific: quoted field with embedded comma (Remarks) ---


def test_csv_quoted_comma_in_remarks_not_split(db_session: Session) -> None:
    """A naive line.split(',') parser would corrupt this row; csv.reader must not."""
    masters = _seed_masters_for_real_xlsx(db_session)
    plant = masters["plant"]

    row = _row5_cells(machine="M001")
    row["AV"] = "Line stopped, restarted after 5 min, no rejection"
    content = _write_minimal_csv(rows=[row])

    result = ingest_dpr_oee_csv(db_session, content, plant_id=plant.id)
    assert result.status == "committed"
    assert result.success_count == 1

    rec = db_session.get(ProductionRecord, result.production_record_ids[0])
    assert rec is not None
    assert rec.remarks == "Line stopped, restarted after 5 min, no rejection"
    # produced_qty must still be the real value, not shifted by a comma split.
    assert rec.produced_qty == Decimal("1200")


# --- CSV-specific: CRLF line endings (as written by _write_minimal_csv) ---


def test_csv_crlf_line_endings_parse_correctly(db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant = masters["plant"]
    content = _write_minimal_csv(rows=[_row5_cells(machine="M001")])
    assert b"\r\n" in content  # sanity: fixture actually uses CRLF

    result = ingest_dpr_oee_csv(db_session, content, plant_id=plant.id)
    assert result.status == "committed"
    assert result.success_count == 1


# --- idempotent re-import ---


def test_csv_idempotent_reimport_updates_not_duplicates(db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant = masters["plant"]
    _seed_second_machine(db_session, masters)
    content = _write_minimal_csv(
        rows=[_row5_cells(machine="M001"), _row6_cells(machine="M002")]
    )

    first = ingest_dpr_oee_csv(db_session, content, plant_id=plant.id)
    assert first.success_count == 2
    ids_first = set(first.production_record_ids)

    second = ingest_dpr_oee_csv(db_session, content, plant_id=plant.id)
    assert second.success_count == 2
    ids_second = set(second.production_record_ids)
    assert ids_first == ids_second

    count = db_session.scalar(
        select(func.count())
        .select_from(ProductionRecord)
        .where(ProductionRecord.plant_id == plant.id)
    )
    assert count == 2

    for pid in ids_second:
        rec = db_session.get(ProductionRecord, pid)
        assert rec is not None
        assert rec.source_type == "csv"


def test_csv_reimport_of_excel_row_upserts_same_record(db_session: Session) -> None:
    """Same business key via CSV after Excel updates the same record — the
    existing external_row_key duplicate policy is business-identity based,
    not source-format based; this is not a new policy, just confirming it
    applies identically for CSV (Section 8: do not invent a new policy).
    """
    masters = _seed_masters_for_real_xlsx(db_session)
    plant = masters["plant"]

    xlsx_path = io.BytesIO()
    _write_minimal_workbook(xlsx_path, rows=[_row5_cells(machine="M001")])

    excel_result = ingest_dpr_oee_workbook(db_session, xlsx_path.getvalue(), plant_id=plant.id)
    assert excel_result.success_count == 1
    excel_record_id = excel_result.production_record_ids[0]
    rec = db_session.get(ProductionRecord, excel_record_id)
    assert rec is not None
    assert rec.source_type == "excel"

    csv_content = _write_minimal_csv(rows=[_row5_cells(machine="M001")])
    csv_result = ingest_dpr_oee_csv(db_session, csv_content, plant_id=plant.id)
    assert csv_result.success_count == 1
    assert csv_result.production_record_ids[0] == excel_record_id

    count = db_session.scalar(
        select(func.count())
        .select_from(ProductionRecord)
        .where(ProductionRecord.plant_id == plant.id)
    )
    assert count == 1  # same record, not a duplicate

    db_session.refresh(rec)
    assert rec.source_type == "csv"  # last import wins, same as repeated Excel


# --- validation error ---


def test_csv_invalid_unknown_machine_validation_error(db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant = masters["plant"]
    row = _row5_cells(machine="UNKNOWN_MACHINE")
    content = _write_minimal_csv(rows=[row])

    result = ingest_dpr_oee_csv(db_session, content, plant_id=plant.id)
    assert result.status == "failed"
    assert result.error_count == 1
    assert result.success_count == 0

    jr = db_session.scalar(
        select(ImportJobRow).where(ImportJobRow.import_job_id == result.import_job_id)
    )
    assert jr is not None
    assert jr.production_record_id is None
    assert any("Unknown machine" in e["message"] for e in jr.validation_errors)
    assert (
        db_session.scalar(
            select(func.count())
            .select_from(ProductionRecord)
            .where(ProductionRecord.plant_id == plant.id)
        )
        == 0
    )


# --- header / structural errors — mirrors Excel's "wrong sheet" case ---


def test_csv_wrong_header_row_fails_job(db_session: Session) -> None:
    """A CSV with a different template layout (e.g. C3='Production Hour'
    instead of 'Shift') must fail loudly, same as Excel's wrong-sheet case —
    not silently import misaligned columns.
    """
    masters = _seed_masters_for_real_xlsx(db_session)
    plant = masters["plant"]
    content = _write_minimal_csv(
        rows=[_row5_cells(machine="M001")],
        row3_overrides={"C": "Production Hour"},
    )
    result = ingest_dpr_oee_csv(db_session, content, plant_id=plant.id)
    assert result.status == "failed"
    assert "Shift" in (result.error_summary or "")
    assert (
        db_session.scalar(
            select(func.count())
            .select_from(ProductionRecord)
            .where(ProductionRecord.plant_id == plant.id)
        )
        == 0
    )


# --- empty / header-only CSV ---


def test_csv_empty_bytes_rejected(db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant = masters["plant"]
    result = ingest_dpr_oee_csv(db_session, b"", plant_id=plant.id)
    assert result.status == "failed"
    assert "empty" in (result.error_summary or "").lower()


def test_csv_header_only_no_data_rows_not_silently_zero(db_session: Session) -> None:
    """Header-only CSV (no row 5+) must fail with a clear message, not
    silently 'succeed' having imported zero rows.
    """
    masters = _seed_masters_for_real_xlsx(db_session)
    plant = masters["plant"]
    content = _write_minimal_csv(rows=[])
    result = ingest_dpr_oee_csv(db_session, content, plant_id=plant.id)
    assert result.status == "failed"
    assert result.error_summary is not None
    assert (
        db_session.scalar(
            select(func.count())
            .select_from(ProductionRecord)
            .where(ProductionRecord.plant_id == plant.id)
        )
        == 0
    )


# --- plant_id required (mirrors Excel's identical check) ---


def test_csv_plant_id_required_parameter(db_session: Session) -> None:
    with pytest.raises(ValueError, match="plant_id"):
        ingest_dpr_oee_csv(db_session, b"a,b\n1,2\n", plant_id=uuid.uuid4())


# --- transactional isolation sanity (mirrors Excel's identical check) ---


def test_csv_no_leftover_when_rolled_back(db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant = masters["plant"]
    _seed_second_machine(db_session, masters)
    content = _write_minimal_csv(
        rows=[_row5_cells(machine="M001"), _row6_cells(machine="M002")]
    )
    before = db_session.scalar(select(func.count()).select_from(ProductionRecord))
    ingest_dpr_oee_csv(db_session, content, plant_id=plant.id)
    after = db_session.scalar(select(func.count()).select_from(ProductionRecord))
    assert after == before + 2
