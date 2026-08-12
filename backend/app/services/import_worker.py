"""Import job execution boundary (in-process worker abstraction).

Purpose
-------
Execute an existing ``ImportJob`` by delegating to ``ingest_dpr_oee_workbook``.
Does not duplicate Excel parsing, OEE calculation, or persistence.

Not a true async queue
----------------------
No Redis/Celery/RabbitMQ/Kafka. No durable object storage. The DPR_OEE API
stores upload bytes only in memory for the request and typically leaves
``file_uri`` NULL — therefore a job **cannot** be re-executed after the
request ends unless the caller supplies ``file_bytes`` (or a readable local
``file_uri`` for CLI/dev). True async requires a future file-storage layer.

Statuses (Migration 007)
------------------------
``import_jobs.status`` is VARCHAR(32) with **no** DB CHECK. App-level values
used by this codebase:

- ``pending`` — created, not yet executed (worker / shell job)
- ``validating`` — in progress (same token ingestion already uses; no separate
  ``processing`` / ``queued`` value exists)
- ``committed`` — finished with ≥1 successful row (incl. partial success)
- ``failed`` — open/header failure or zero successful rows

Concurrency
-----------
No distributed lock / locking table. Eligibility is checked in the caller's
DB session only — concurrent workers can race. Documented limitation.

Transaction
-----------
Flushes only; caller commits (same pattern as API / ingestion).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.import_job import ImportJob
from app.services.dpr_oee_ingestion import ImportJobResult, ingest_dpr_oee_workbook

# App-level lifecycle tokens (no DB CHECK on status in Migration 007).
STATUS_PENDING = "pending"
STATUS_VALIDATING = "validating"
STATUS_COMMITTED = "committed"
STATUS_FAILED = "failed"

_SAFE_UNEXPECTED = "Unexpected error during import execution"
_SAFE_MISSING_BYTES = (
    "Workbook bytes are required: import_jobs.file_uri is null and persistent "
    "file storage is not implemented. Pass file_bytes for in-process / test / CLI "
    "execution. True async re-execution needs a future storage layer."
)


class ImportWorkerError(Exception):
    """Base worker error (safe message; no secrets)."""


class ImportJobNotFoundError(ImportWorkerError):
    """No import_jobs row for the given id."""


class ImportJobNotEligibleError(ImportWorkerError):
    """Job exists but must not be executed in the current state."""


class ImportJobMissingBytesError(ImportWorkerError):
    """Cannot run without bytes / readable file_uri."""


@dataclass(frozen=True, slots=True)
class WorkerRunResult:
    """Outcome of ``run_import_job`` (includes skip / eligibility outcomes)."""

    import_job_id: UUID
    status: str
    row_count: int = 0
    success_count: int = 0
    error_count: int = 0
    skipped_count: int = 0
    production_record_ids: list[UUID] = field(default_factory=list)
    error_summary: str | None = None
    executed: bool = True
    skipped: bool = False
    message: str | None = None


def prepare_dpr_oee_import_job(
    session: Session,
    *,
    plant_id: UUID,
    uploaded_by: UUID | None = None,
    file_uri: str | None = None,
) -> ImportJob:
    """Create a ``pending`` ImportJob shell (flush only; no ingest yet).

    ``file_uri`` is typically None for multipart uploads — bytes are not
    persisted. Call ``run_import_job(..., file_bytes=...)`` in the same process.
    """
    job = ImportJob(
        source_type="excel",
        file_uri=file_uri,
        uploaded_by=uploaded_by,
        status=STATUS_PENDING,
        mapping_config={
            "template": "DPR_OEE",
            "plant_id": str(plant_id),
            "bytes_persisted": False if file_uri is None else True,
        },
    )
    session.add(job)
    session.flush()
    return job


def _safe_exc_message(exc: BaseException) -> str:
    """Public error text — never echo connection strings / credentials."""
    text = str(exc)
    lowered = text.lower()
    for needle in (
        "password",
        "postgres://",
        "postgresql",
        "connection string",
        "secret",
        "api_key",
        "database_url",
    ):
        if needle in lowered:
            return _SAFE_UNEXPECTED
    # Keep short operational messages (e.g. plant not found) when safe.
    if len(text) > 300:
        return _SAFE_UNEXPECTED
    return text or _SAFE_UNEXPECTED


def _resolve_plant_id(
    job: ImportJob,
    plant_id: UUID | None,
) -> UUID:
    if plant_id is not None:
        return plant_id
    cfg: dict[str, Any] = job.mapping_config or {}
    raw = cfg.get("plant_id")
    if raw is None:
        raise ImportJobNotEligibleError(
            "ImportJob.mapping_config.plant_id is missing; pass plant_id="
        )
    try:
        return UUID(str(raw))
    except (TypeError, ValueError) as exc:
        raise ImportJobNotEligibleError(
            "ImportJob.mapping_config.plant_id is invalid"
        ) from exc


def _resolve_file_bytes(
    job: ImportJob,
    file_bytes: bytes | None,
) -> bytes:
    if file_bytes is not None:
        if not file_bytes:
            raise ImportJobMissingBytesError("Uploaded workbook bytes are empty")
        return file_bytes

    if job.file_uri:
        path = Path(job.file_uri)
        try:
            data = path.read_bytes()
        except OSError as exc:
            raise ImportJobMissingBytesError(
                "Unable to read import_jobs.file_uri; pass file_bytes instead "
                "(persistent object storage is not implemented)"
            ) from exc
        if not data:
            raise ImportJobMissingBytesError("Workbook at file_uri is empty")
        return data

    raise ImportJobMissingBytesError(_SAFE_MISSING_BYTES)


def _assert_eligible(job: ImportJob, *, force: bool) -> WorkerRunResult | None:
    """Return a skip result for completed jobs; raise if ineligible; else None."""
    status = job.status

    if status == STATUS_COMMITTED and not force:
        return WorkerRunResult(
            import_job_id=job.id,
            status=job.status,
            row_count=job.row_count,
            success_count=job.success_count,
            error_count=job.error_count,
            error_summary=job.error_summary,
            executed=False,
            skipped=True,
            message=(
                "ImportJob already committed; pass force=True to re-execute "
                "(requires file_bytes when file_uri is null)"
            ),
        )

    if status == STATUS_VALIDATING and not force:
        raise ImportJobNotEligibleError(
            "ImportJob is already validating/in-progress; pass force=True to "
            "recover a stuck job (no distributed lock — concurrency is best-effort)"
        )

    if status == STATUS_FAILED:
        # Retry allowed when caller supplies bytes (or force); checked later.
        return None

    if status in (STATUS_PENDING, STATUS_COMMITTED) or force:
        return None

    # Unknown / unsupported app status — refuse without inventing transitions.
    raise ImportJobNotEligibleError(
        f"ImportJob status {status!r} is not eligible for worker execution"
    )


def run_import_job(
    session: Session,
    import_job_id: UUID,
    *,
    file_bytes: bytes | None = None,
    force: bool = False,
    plant_id: UUID | None = None,
) -> WorkerRunResult:
    """Execute an existing ImportJob via ``ingest_dpr_oee_workbook`` (no commit).

    Parameters
    ----------
    file_bytes:
        Workbook bytes. Required when ``file_uri`` is null (typical API upload).
    force:
        Re-run a ``committed`` job, or recover a stuck ``validating`` job.
        Failed jobs may retry whenever ``file_bytes`` (or readable ``file_uri``)
        is available — ``force`` is not required for ``failed``.
    plant_id:
        Override; otherwise read from ``mapping_config["plant_id"]``.
    """
    job = session.get(ImportJob, import_job_id)
    if job is None:
        raise ImportJobNotFoundError(f"ImportJob {import_job_id} not found")

    skip = _assert_eligible(job, force=force)
    if skip is not None:
        return skip

    if job.status == STATUS_FAILED and file_bytes is None and not job.file_uri:
        raise ImportJobMissingBytesError(
            "Failed ImportJob retry requires file_bytes (file_uri is null; "
            "persistent storage not implemented)"
        )

    try:
        resolved_plant_id = _resolve_plant_id(job, plant_id)
        workbook_bytes = _resolve_file_bytes(job, file_bytes)
    except ImportWorkerError:
        raise
    except Exception as exc:  # noqa: BLE001
        job.status = STATUS_FAILED
        job.error_summary = _SAFE_UNEXPECTED
        session.flush()
        raise ImportWorkerError(_SAFE_UNEXPECTED) from exc

    # Mark in-progress using existing app token (no separate "processing").
    job.status = STATUS_VALIDATING
    session.flush()

    try:
        result: ImportJobResult = ingest_dpr_oee_workbook(
            session,
            workbook_bytes,
            plant_id=resolved_plant_id,
            uploaded_by=job.uploaded_by,
            import_job=job,
        )
    except ValueError as exc:
        # e.g. plant_id not found — mark failed, safe message, re-raise for API mapping
        job.status = STATUS_FAILED
        job.error_summary = _safe_exc_message(exc)
        session.flush()
        raise
    except ImportWorkerError:
        raise
    except Exception as exc:  # noqa: BLE001 — never leak secrets
        job.status = STATUS_FAILED
        job.error_summary = _SAFE_UNEXPECTED
        session.flush()
        return WorkerRunResult(
            import_job_id=job.id,
            status=job.status,
            row_count=job.row_count,
            success_count=job.success_count,
            error_count=job.error_count,
            error_summary=job.error_summary,
            executed=True,
            skipped=False,
            message=_SAFE_UNEXPECTED,
        )

    return WorkerRunResult(
        import_job_id=result.import_job_id,
        status=result.status,
        row_count=result.row_count,
        success_count=result.success_count,
        error_count=result.error_count,
        skipped_count=result.skipped_count,
        production_record_ids=list(result.production_record_ids),
        error_summary=result.error_summary,
        executed=True,
        skipped=False,
        message=result.error_summary,
    )


__all__ = [
    "ImportJobMissingBytesError",
    "ImportJobNotEligibleError",
    "ImportJobNotFoundError",
    "ImportWorkerError",
    "STATUS_COMMITTED",
    "STATUS_FAILED",
    "STATUS_PENDING",
    "STATUS_VALIDATING",
    "WorkerRunResult",
    "prepare_dpr_oee_import_job",
    "run_import_job",
]
