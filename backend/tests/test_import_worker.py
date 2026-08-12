"""Tests for import worker / in-process execution boundary.

Uses Compose Postgres (127.0.0.1:5433 / pril_analytics) inside a rolled-back
outer transaction so no temporary masters/production/import rows remain.

Covers validation items 1–12. Prior calculator/persistence/ingestion/API/health
suites must continue to pass.
"""

from __future__ import annotations

import io
import uuid
from unittest.mock import patch
from uuid import UUID

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.db.session import get_engine
from app.models.import_job import ImportJob
from app.models.import_job_row import ImportJobRow
from app.models.plant import Plant
from app.models.production_record import ProductionRecord
from app.services import import_worker as import_worker_mod
from app.services.dpr_oee_ingestion import ingest_dpr_oee_workbook
from app.services.import_worker import (
    STATUS_COMMITTED,
    STATUS_FAILED,
    STATUS_PENDING,
    STATUS_VALIDATING,
    ImportJobMissingBytesError,
    ImportJobNotEligibleError,
    ImportJobNotFoundError,
    prepare_dpr_oee_import_job,
    run_import_job,
)
from tests.test_dpr_oee_ingestion import (
    _row5_cells,
    _row6_cells,
    _seed_masters_for_real_xlsx,
    _seed_second_machine,
    _write_minimal_workbook,
)


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


def _xlsx_bytes(*, rows: list[dict]) -> bytes:
    buf = io.BytesIO()
    _write_minimal_workbook(buf, rows=rows)
    return buf.getvalue()


def _prepare_job(session: Session, plant_id: UUID, **kwargs) -> ImportJob:
    return prepare_dpr_oee_import_job(session, plant_id=plant_id, **kwargs)


# --- 1: valid import job execution ---


def test_worker_1_valid_import_job_execution(db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    _seed_second_machine(db_session, masters)
    content = _xlsx_bytes(
        rows=[_row5_cells(machine="M001"), _row6_cells(machine="M002")]
    )
    job = _prepare_job(db_session, plant.id)
    assert job.status == STATUS_PENDING

    result = run_import_job(db_session, job.id, file_bytes=content)
    db_session.flush()

    assert result.executed is True
    assert result.skipped is False
    assert result.status == STATUS_COMMITTED
    assert result.success_count == 2
    assert result.error_count == 0
    assert result.row_count == 2

    refreshed = db_session.get(ImportJob, job.id)
    assert refreshed is not None
    assert refreshed.status == STATUS_COMMITTED
    assert refreshed.success_count == 2
    assert refreshed.id == result.import_job_id


# --- 2: missing ImportJob ---


def test_worker_2_missing_import_job(db_session: Session) -> None:
    missing = uuid.uuid4()
    with pytest.raises(ImportJobNotFoundError):
        run_import_job(db_session, missing, file_bytes=b"unused")


# --- 3: already-completed ImportJob ---


def test_worker_3_already_completed_not_reexecuted(db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    content = _xlsx_bytes(rows=[_row5_cells()])
    job = _prepare_job(db_session, plant.id)
    first = run_import_job(db_session, job.id, file_bytes=content)
    assert first.status == STATUS_COMMITTED

    second = run_import_job(db_session, job.id, file_bytes=content)
    assert second.skipped is True
    assert second.executed is False
    assert second.status == STATUS_COMMITTED
    assert "already committed" in (second.message or "").lower()

    # No second ingest → still one production record for this key set
    count = db_session.scalar(select(func.count()).select_from(ProductionRecord))
    assert count == 1


# --- 4: retry behavior for failed job ---


def test_worker_4_failed_job_retry_with_bytes(db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    job = _prepare_job(db_session, plant.id)

    bad = run_import_job(db_session, job.id, file_bytes=b"not-an-excel")
    assert bad.status == STATUS_FAILED
    assert db_session.get(ImportJob, job.id).status == STATUS_FAILED

    # Retry without bytes when file_uri is null → explicit missing-bytes error
    with pytest.raises(ImportJobMissingBytesError):
        run_import_job(db_session, job.id)

    good = _xlsx_bytes(rows=[_row5_cells()])
    retry = run_import_job(db_session, job.id, file_bytes=good)
    assert retry.status == STATUS_COMMITTED
    assert retry.success_count == 1
    assert retry.executed is True
    assert db_session.get(ImportJob, job.id).status == STATUS_COMMITTED


# --- 5: duplicate / idempotent execution ---


def test_worker_5_idempotent_force_rerun(db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    content = _xlsx_bytes(rows=[_row5_cells()])
    job = _prepare_job(db_session, plant.id)
    run_import_job(db_session, job.id, file_bytes=content)

    # Force re-run same job + bytes — external_row_key upsert, no duplicate rows
    again = run_import_job(db_session, job.id, file_bytes=content, force=True)
    assert again.status == STATUS_COMMITTED
    assert again.executed is True

    count = db_session.scalar(select(func.count()).select_from(ProductionRecord))
    assert count == 1

    # Second pending job with same workbook also upserts by external_row_key
    job2 = _prepare_job(db_session, plant.id)
    run_import_job(db_session, job2.id, file_bytes=content)
    count2 = db_session.scalar(select(func.count()).select_from(ProductionRecord))
    assert count2 == 1


# --- 6: invalid workbook ---


def test_worker_6_invalid_workbook(db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    job = _prepare_job(db_session, plant.id)
    result = run_import_job(db_session, job.id, file_bytes=b"%%not-xlsx%%")
    assert result.status == STATUS_FAILED
    assert result.executed is True
    assert db_session.get(ImportJob, job.id).status == STATUS_FAILED
    assert db_session.get(ImportJob, job.id).error_summary


# --- 7: row-level validation errors ---


def test_worker_7_row_level_validation_errors(db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    # Unknown machine → row validation error (masters not invented)
    content = _xlsx_bytes(rows=[_row5_cells(machine="NO_SUCH_MACHINE")])
    job = _prepare_job(db_session, plant.id)
    result = run_import_job(db_session, job.id, file_bytes=content)

    assert result.status == STATUS_FAILED
    assert result.error_count >= 1
    assert result.success_count == 0

    rows = db_session.scalars(
        select(ImportJobRow).where(ImportJobRow.import_job_id == job.id)
    ).all()
    assert len(rows) >= 1
    assert any(r.validation_errors for r in rows)
    assert all(r.production_record_id is None for r in rows)


# --- 8: unexpected exception handling ---


def test_worker_8_unexpected_exception_safe(db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    job = _prepare_job(db_session, plant.id)
    content = _xlsx_bytes(rows=[_row5_cells()])

    with patch.object(
        import_worker_mod,
        "ingest_dpr_oee_workbook",
        side_effect=RuntimeError(
            "boom postgresql+psycopg://user:secret@host/db password=leak"
        ),
    ):
        result = run_import_job(db_session, job.id, file_bytes=content)

    assert result.status == STATUS_FAILED
    assert result.executed is True
    summary = db_session.get(ImportJob, job.id).error_summary or ""
    assert "secret" not in summary.lower()
    assert "password" not in summary.lower()
    assert "postgresql" not in summary.lower()
    assert "Unexpected error" in summary


# --- 9: status transitions (app-level only; no DB CHECK) ---


def test_worker_9_status_transitions(db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    content = _xlsx_bytes(rows=[_row5_cells()])
    job = _prepare_job(db_session, plant.id)
    assert job.status == STATUS_PENDING

    seen: list[str] = []

    real_ingest = ingest_dpr_oee_workbook

    def _wrap(*args, **kwargs):
        j = kwargs.get("import_job") or args[0]
        # During ingest call the worker has already set validating
        current = db_session.get(ImportJob, job.id)
        assert current is not None
        seen.append(current.status)
        assert current.status == STATUS_VALIDATING
        return real_ingest(*args, **kwargs)

    with patch.object(import_worker_mod, "ingest_dpr_oee_workbook", side_effect=_wrap):
        result = run_import_job(db_session, job.id, file_bytes=content)

    assert seen == [STATUS_VALIDATING]
    assert result.status == STATUS_COMMITTED
    assert db_session.get(ImportJob, job.id).status == STATUS_COMMITTED

    # validating without force is ineligible (concurrency best-effort)
    stuck = _prepare_job(db_session, plant.id)
    stuck.status = STATUS_VALIDATING
    db_session.flush()
    with pytest.raises(ImportJobNotEligibleError):
        run_import_job(db_session, stuck.id, file_bytes=content)


# --- 10: transaction rollback behavior ---


def test_worker_10_transaction_rollback(db_session: Session) -> None:
    """Worker flushes only — uncommitted work is invisible to other connections."""
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    content = _xlsx_bytes(rows=[_row5_cells()])
    job = _prepare_job(db_session, plant.id)

    run_import_job(db_session, job.id, file_bytes=content)
    db_session.flush()
    assert db_session.scalar(select(func.count()).select_from(ImportJob)) >= 1
    assert db_session.scalar(select(func.count()).select_from(ProductionRecord)) == 1

    # Caller did not commit → separate connection sees no operational leftovers.
    engine = get_engine()
    with engine.connect() as conn:
        for table in (
            "import_jobs",
            "import_job_rows",
            "production_records",
            "downtime_events",
            "rejection_events",
        ):
            count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            assert count == 0, f"{table} visible without commit, count={count}"


# --- 11: database remains consistent after failure ---


def test_worker_11_consistent_after_failure(db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    job = _prepare_job(db_session, plant.id)
    result = run_import_job(db_session, job.id, file_bytes=b"corrupt")
    assert result.status == STATUS_FAILED

    pr = db_session.scalar(select(func.count()).select_from(ProductionRecord))
    assert pr == 0
    refreshed = db_session.get(ImportJob, job.id)
    assert refreshed is not None
    assert refreshed.status == STATUS_FAILED
    assert refreshed.success_count == 0


# --- 12 + leftover gate ---


def test_worker_12_no_leftover_operational_rows(db_session: Session) -> None:
    """Live DB (outside rolled-back txn) must stay clean — prior 55 + worker."""
    _ = db_session
    engine = get_engine()
    with engine.connect() as conn:
        for table in (
            "production_records",
            "downtime_events",
            "rejection_events",
            "import_jobs",
            "import_job_rows",
        ):
            count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            assert count == 0, f"expected 0 leftover rows in {table}, got {count}"


def test_worker_missing_bytes_when_file_uri_null(db_session: Session) -> None:
    masters = _seed_masters_for_real_xlsx(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    job = _prepare_job(db_session, plant.id)
    assert job.file_uri is None
    with pytest.raises(ImportJobMissingBytesError) as exc_info:
        run_import_job(db_session, job.id)
    assert "file_bytes" in str(exc_info.value).lower() or "bytes" in str(
        exc_info.value
    ).lower()
