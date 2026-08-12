"""DPR_OEE import APIs — development/internal (auth not yet implemented).

POST uploads call ``ingest_dpr_oee_workbook``; the API session owns commit.
Idempotency is solely via ingestion ``external_row_key`` (no second mechanism).
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.schemas.imports import (
    DprOeeImportResponse,
    ImportJobRowResponse,
    ImportJobRowsPageResponse,
    ImportJobSummaryResponse,
)
from app.db.session import get_db
from app.models.import_job import ImportJob
from app.models.import_job_row import ImportJobRow
from app.services.dpr_oee_ingestion import ingest_dpr_oee_workbook

router = APIRouter(
    prefix="/api/v1",
    tags=["imports"],
)

_ALLOWED_EXTENSIONS = (".xlsx", ".xlsm")
_MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MiB soft guard


def _safe_detail(message: str) -> str:
    """Public error text — never include connection strings / secrets."""
    return message


def _row_status(row: ImportJobRow) -> str:
    """Derive row result from existing schema (no status column on rows)."""
    errors = row.validation_errors
    has_errors = bool(errors)
    if has_errors:
        return "error"
    if row.production_record_id is not None:
        return "success"
    return "error"


def _import_message(status: str, error_summary: str | None) -> str:
    if error_summary:
        return error_summary
    if status == "committed":
        return "Import completed successfully"
    if status == "failed":
        return "Import failed"
    return f"Import finished with status={status}"


@router.post(
    "/imports/dpr-oee",
    response_model=DprOeeImportResponse,
    summary="Upload DPR_OEE Excel workbook",
    description=(
        "Development/internal endpoint (authentication not yet implemented). "
        "Multipart: Excel file + plant_id (+ optional uploaded_by). "
        "Calls existing ingest_dpr_oee_workbook; API session commits on success."
    ),
    responses={
        400: {"description": "Invalid upload or plant_id"},
        404: {"description": "Plant not found"},
        422: {"description": "Form / file validation error"},
        500: {"description": "Unexpected server error"},
    },
)
async def upload_dpr_oee(
    file: Annotated[UploadFile, File(description="DPR_OEE Excel workbook (.xlsx/.xlsm)")],
    plant_id: Annotated[UUID, Form(description="Target plant UUID (Q11 — required)")],
    uploaded_by: Annotated[
        UUID | None,
        Form(description="Optional uploader user UUID (no auth yet)"),
    ] = None,
    db: Session = Depends(get_db),
) -> DprOeeImportResponse:
    filename = (file.filename or "").strip()
    if not filename:
        raise HTTPException(
            status_code=400,
            detail=_safe_detail("Excel file is required"),
        )
    lower = filename.lower()
    if not lower.endswith(_ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail=_safe_detail("File must be an Excel workbook (.xlsx or .xlsm)"),
        )

    try:
        content = await file.read()
    except Exception:  # noqa: BLE001
        raise HTTPException(
            status_code=400,
            detail=_safe_detail("Failed to read uploaded file"),
        ) from None

    if not content:
        raise HTTPException(
            status_code=400,
            detail=_safe_detail("Uploaded file is empty"),
        )
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=_safe_detail("Uploaded file exceeds maximum allowed size"),
        )

    try:
        result = ingest_dpr_oee_workbook(
            db,
            content,
            plant_id=plant_id,
            uploaded_by=uploaded_by,
        )
    except ValueError as exc:
        # plant_id not found (raised before job creation)
        msg = str(exc)
        if "not found" in msg.lower():
            raise HTTPException(
                status_code=404,
                detail=_safe_detail("Plant not found"),
            ) from None
        raise HTTPException(
            status_code=400,
            detail=_safe_detail("Invalid import request"),
        ) from None
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001 — no stack / secrets to client
        raise HTTPException(
            status_code=500,
            detail=_safe_detail("Unexpected error during import"),
        ) from None

    # Session commit is owned by get_db after successful response.
    return DprOeeImportResponse(
        import_job_id=result.import_job_id,
        status=result.status,
        total_rows=result.row_count,
        success_count=result.success_count,
        error_count=result.error_count,
        message=_import_message(result.status, result.error_summary),
    )


@router.get(
    "/imports/{import_id}",
    response_model=ImportJobSummaryResponse,
    summary="Get import job summary",
    description="Development/internal — authentication not yet implemented.",
    responses={
        404: {"description": "Import job not found"},
        500: {"description": "Unexpected server error"},
    },
)
def get_import_job(
    import_id: UUID,
    db: Session = Depends(get_db),
) -> ImportJobSummaryResponse:
    job = db.get(ImportJob, import_id)
    if job is None:
        raise HTTPException(
            status_code=404,
            detail=_safe_detail("Import job not found"),
        )
    # Schema has row_count only — expose as both total_rows and processed_rows.
    return ImportJobSummaryResponse(
        id=job.id,
        source_type=job.source_type,
        status=job.status,
        file_uri=job.file_uri,
        total_rows=job.row_count,
        processed_rows=job.row_count,
        success_count=job.success_count,
        error_count=job.error_count,
        error_summary=job.error_summary,
        uploaded_by=job.uploaded_by,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.get(
    "/imports/{import_id}/rows",
    response_model=ImportJobRowsPageResponse,
    summary="List import job rows (paginated)",
    description="Development/internal — authentication not yet implemented.",
    responses={
        400: {"description": "Invalid pagination parameters"},
        404: {"description": "Import job not found"},
        422: {"description": "Query validation error"},
    },
)
def list_import_job_rows(
    import_id: UUID,
    db: Session = Depends(get_db),
    limit: Annotated[int | None, Query(ge=1, le=200)] = None,
    offset: Annotated[int | None, Query(ge=0)] = None,
    page: Annotated[int | None, Query(ge=1)] = None,
    size: Annotated[int | None, Query(ge=1, le=200)] = None,
) -> ImportJobRowsPageResponse:
    job = db.get(ImportJob, import_id)
    if job is None:
        raise HTTPException(
            status_code=404,
            detail=_safe_detail("Import job not found"),
        )

    # Support limit/offset OR page/size (page is 1-based).
    if page is not None or size is not None:
        if page is None or size is None:
            raise HTTPException(
                status_code=400,
                detail=_safe_detail("page and size must be provided together"),
            )
        if limit is not None or offset is not None:
            raise HTTPException(
                status_code=400,
                detail=_safe_detail("Use either limit/offset or page/size, not both"),
            )
        resolved_limit = size
        resolved_offset = (page - 1) * size
    else:
        resolved_limit = limit if limit is not None else 50
        resolved_offset = offset if offset is not None else 0

    total = db.scalar(
        select(func.count())
        .select_from(ImportJobRow)
        .where(ImportJobRow.import_job_id == import_id)
    )
    assert total is not None

    rows = db.scalars(
        select(ImportJobRow)
        .where(ImportJobRow.import_job_id == import_id)
        .order_by(ImportJobRow.row_number)
        .limit(resolved_limit)
        .offset(resolved_offset)
    ).all()

    items = [
        ImportJobRowResponse(
            id=r.id,
            row_number=r.row_number,
            external_row_key=r.external_row_key,
            validation_errors=r.validation_errors if r.validation_errors is not None else [],
            production_record_id=r.production_record_id,
            status=_row_status(r),
        )
        for r in rows
    ]
    return ImportJobRowsPageResponse(
        items=items,
        total=int(total),
        limit=resolved_limit,
        offset=resolved_offset,
    )
