"""DPR_OEE import APIs — development/internal (auth not yet implemented).

POST uploads call ``ingest_dpr_oee_workbook``; the API session owns commit.
Idempotency is solely via ingestion ``external_row_key`` (no second mechanism).
After successful ingestion, calls rollup functions to create/update oee_snapshots
and queues SSE events for dashboard refresh (transaction-safe).
"""

from __future__ import annotations

import io
from datetime import date
from typing import Annotated
from uuid import UUID

import openpyxl

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.schemas.imports import (
    ColumnMappingTemplateCreateRequest,
    ColumnMappingTemplateListResponse,
    ColumnMappingTemplateResponse,
    DataSourceCreateRequest,
    DataSourceListResponse,
    DataSourceResponse,
    DprOeeImportResponse,
    ImportJobRowResponse,
    ImportJobRowsPageResponse,
    ImportJobSummaryResponse,
    ImportMappingValidationRequest,
    ImportMappingValidationResponse,
    ImportPreviewResponse,
)
from app.core.rbac import require_permission
from app.db.session import get_db
from app.models.column_mapping_template import ColumnMappingTemplate
from app.models.data_source import DataSource
from app.models.import_job import ImportJob
from app.models.import_job_row import ImportJobRow
from app.models.production_record import ProductionRecord
from app.services.dpr_oee_ingestion import ingest_dpr_oee_workbook
from app.services.event_queue import queue_oee_updated_event
from app.services.flexible_workbook_ingestion import (
    ingest_flexible_csv,
    ingest_flexible_workbook,
)
from app.services.oee_rollup import (
    PERIOD_DAY,
    SCOPE_MACHINE,
    SCOPE_PLANT,
    rollup_machine_day,
    rollup_plant_day,
)

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


def _normalise_source_type(source_type: str | None) -> str:
    value = (source_type or "").strip().lower()
    if value not in {"excel", "csv", "form", "sheets", "manual", "api"}:
        raise HTTPException(
            status_code=400,
            detail=_safe_detail("source_type must be one of: excel, csv, form, sheets, manual, api"),
        )
    return value


@router.get(
    "/data-sources",
    response_model=DataSourceListResponse,
    dependencies=[Depends(require_permission("imports", "READ"))],
    summary="List data sources",
)
def list_data_sources(db: Session = Depends(get_db)) -> DataSourceListResponse:
    rows = db.scalars(select(DataSource).order_by(DataSource.code)).all()
    return DataSourceListResponse(
        items=[DataSourceResponse.model_validate(row) for row in rows],
        count=len(rows),
    )


@router.post(
    "/data-sources",
    response_model=DataSourceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("imports", "CREATE"))],
    summary="Create a data source metadata record",
)
def create_data_source(
    payload: DataSourceCreateRequest,
    db: Session = Depends(get_db),
) -> DataSourceResponse:
    code = (payload.code or "").strip()
    name = (payload.name or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail=_safe_detail("Data source code is required"))
    if not name:
        raise HTTPException(status_code=400, detail=_safe_detail("Data source name is required"))

    source_type = _normalise_source_type(payload.source_type)
    existing = db.scalar(select(DataSource).where(func.lower(DataSource.code) == code.lower()))
    if existing is not None:
        raise HTTPException(status_code=409, detail=_safe_detail("Data source code already exists"))

    row = DataSource(
        code=code,
        name=name,
        source_type=source_type,
        config=payload.config or {},
        freshness_sla_minutes=payload.freshness_sla_minutes,
        is_active=payload.is_active,
    )
    db.add(row)
    db.flush()
    return DataSourceResponse.model_validate(row)


@router.get(
    "/column-mapping-templates",
    response_model=ColumnMappingTemplateListResponse,
    dependencies=[Depends(require_permission("imports", "READ"))],
    summary="List saved column mappings",
)
def list_column_mapping_templates(db: Session = Depends(get_db)) -> ColumnMappingTemplateListResponse:
    rows = db.scalars(select(ColumnMappingTemplate).order_by(ColumnMappingTemplate.name)).all()
    return ColumnMappingTemplateListResponse(
        items=[ColumnMappingTemplateResponse.model_validate(row) for row in rows],
        count=len(rows),
    )


@router.post(
    "/column-mapping-templates",
    response_model=ColumnMappingTemplateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("imports", "CREATE"))],
    summary="Save a column mapping template",
)
def create_column_mapping_template(
    payload: ColumnMappingTemplateCreateRequest,
    db: Session = Depends(get_db),
) -> ColumnMappingTemplateResponse:
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail=_safe_detail("Mapping template name is required"))
    source_type = _normalise_source_type(payload.source_type)

    existing = db.scalar(
        select(ColumnMappingTemplate).where(
            func.lower(ColumnMappingTemplate.name) == name.lower(),
            ColumnMappingTemplate.source_type == source_type,
            ColumnMappingTemplate.version == payload.version,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail=_safe_detail("Mapping template already exists"))

    row = ColumnMappingTemplate(
        name=name,
        source_type=source_type,
        department_id=payload.department_id,
        mapping=payload.mapping or {},
        version=max(1, int(payload.version or 1)),
        is_active=payload.is_active,
    )
    db.add(row)
    db.flush()
    return ColumnMappingTemplateResponse.model_validate(row)


@router.post(
    "/imports/preview",
    response_model=ImportPreviewResponse,
    dependencies=[Depends(require_permission("imports", "READ"))],
    summary="Preview CSV/Excel file headers and first rows",
)
async def preview_import_file(
    file: Annotated[UploadFile, File(description="CSV or Excel source file")],
    source_type: Annotated[str, Form(description="Source type: csv, excel, form, sheets")],
    db: Session = Depends(get_db),
) -> ImportPreviewResponse:
    del db
    source_type = _normalise_source_type(source_type)
    filename = (file.filename or "").strip()
    if not filename:
        raise HTTPException(status_code=400, detail=_safe_detail("File is required"))

    lower = filename.lower()
    if source_type in {"csv", "excel"} and not (lower.endswith(".csv") or lower.endswith(".xlsx") or lower.endswith(".xlsm")):
        raise HTTPException(status_code=400, detail=_safe_detail("Unsupported file type for the selected source_type"))

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail=_safe_detail("Uploaded file is empty"))

    try:
        if lower.endswith(".csv"):
            text = contents.decode("utf-8-sig")
            rows = []
            lines = text.splitlines()
            if not lines:
                raise HTTPException(status_code=400, detail=_safe_detail("CSV file is empty"))
            headers = [cell.strip() for cell in lines[0].split(",")]
            for line in lines[1:]:
                if not line.strip():
                    continue
                values = [cell.strip() for cell in line.split(",")]
                row = dict(zip(headers, values, strict=False))
                rows.append(row)
            return ImportPreviewResponse(
                source_type=source_type,
                headers=headers,
                rows=rows[:25],
                row_count=len(rows),
                preview_limit=25,
            )

        workbook = openpyxl.load_workbook(filename=io.BytesIO(contents), read_only=True, data_only=True)
        ws = workbook.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            raise HTTPException(status_code=400, detail=_safe_detail("Workbook is empty"))
        headers = [str(cell).strip() if cell is not None else "" for cell in rows[0]]
        data_rows = []
        for raw in rows[1:]:
            if all(cell is None or str(cell).strip() == "" for cell in raw):
                continue
            data_rows.append({headers[i]: raw[i] for i in range(min(len(headers), len(raw)))})
        return ImportPreviewResponse(
            source_type=source_type,
            headers=headers,
            rows=data_rows[:25],
            row_count=len(data_rows),
            preview_limit=25,
        )
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail=_safe_detail("Unable to decode the uploaded file")) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=_safe_detail(f"Unable to preview file: {exc}")) from exc


_PRODUCTION_MAPPING_REQUIRED_FIELDS = [
    "plant_code",
    "line_code",
    "machine_code",
    "part_code",
    "production_date",
    "shift_code",
    "start_at",
    "stop_at",
    "produced_qty",
]


@router.post(
    "/imports/validate-mapping",
    response_model=ImportMappingValidationResponse,
    dependencies=[Depends(require_permission("imports", "READ"))],
    summary="Validate a mapping between uploaded headers and required production fields",
)
def validate_import_mapping(
    payload: ImportMappingValidationRequest,
    db: Session = Depends(get_db),
) -> ImportMappingValidationResponse:
    del db
    source_type = _normalise_source_type(payload.source_type)
    headers = [str(h).strip() for h in payload.headers or [] if str(h).strip()]
    mapping = payload.mapping or {}

    required_fields = list(_PRODUCTION_MAPPING_REQUIRED_FIELDS)
    missing_fields: list[str] = []
    mapped_fields: dict[str, str] = {}
    warnings: list[str] = []

    for field_name in required_fields:
        raw_value = mapping.get(field_name)
        if raw_value is None:
            missing_fields.append(field_name)
            continue
        value = str(raw_value).strip()
        if not value:
            missing_fields.append(field_name)
            continue
        if value not in headers:
            missing_fields.append(field_name)
            continue
        mapped_fields[field_name] = value

    if source_type in {"csv", "excel"} and not headers:
        raise HTTPException(status_code=400, detail=_safe_detail("Headers are required to validate a mapping"))

    if not mapped_fields:
        warnings.append("No required production fields were mapped to the uploaded headers.")

    return ImportMappingValidationResponse(
        source_type=source_type,
        valid=not missing_fields,
        required_fields=required_fields,
        missing_fields=missing_fields,
        mapped_fields=mapped_fields,
        warnings=warnings,
    )


@router.post(
    "/imports/dpr-oee",
    response_model=DprOeeImportResponse,
    dependencies=[Depends(require_permission("imports", "CREATE"))],
    summary="Upload DPR_OEE Excel workbook (LEGACY — use /imports/flexible)",
    description=(
        "LEGACY ENDPOINT — Use POST /api/v1/imports/flexible for new imports. "
        "This endpoint is maintained for backward compatibility with rigid DPR_OEE template format. "
        "Development/internal endpoint (authentication not yet implemented). "
        "Multipart: Excel file + plant_id (+ optional uploaded_by). "
        "Calls ingest_dpr_oee_workbook and triggers OEE rollup. "
        "API session commits on success; SSE events emitted after commit."
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

    # Trigger rollup for committed imports with successful records.
    # This ensures oee_snapshots are created/updated, making data visible to dashboard.
    if result.status == "committed" and result.success_count > 0:
        try:
            # Get production_date from the first successful record
            production_date: date | None = None
            if result.production_record_ids:
                rec = db.get(ProductionRecord, result.production_record_ids[0])
                if rec is not None:
                    production_date = rec.production_date

            if production_date is not None:
                # Plant-level rollup aggregates all machines for this plant+date
                plant_snap = rollup_plant_day(db, plant_id, production_date)
                db.flush()

                # Queue event if snapshot was created/updated
                if plant_snap is not None:
                    queue_oee_updated_event(
                        db,
                        scope_type=SCOPE_PLANT,
                        scope_id=plant_id,
                        period_type=PERIOD_DAY,
                        period_start=production_date,
                    )

                # Also rollup individual machines for dashboard drill-down
                machines = db.scalars(
                    select(ProductionRecord.machine_id)
                    .distinct()
                    .where(ProductionRecord.id.in_(result.production_record_ids))
                ).all()

                for machine_id in machines:
                    if machine_id is not None:
                        machine_snap = rollup_machine_day(db, machine_id, production_date)
                        db.flush()
                        if machine_snap is not None:
                            queue_oee_updated_event(
                                db,
                                scope_type=SCOPE_MACHINE,
                                scope_id=machine_id,
                                period_type=PERIOD_DAY,
                                period_start=production_date,
                            )
        except Exception as exc:
            # Log but don't fail the import on rollup/event-queue errors
            # (production data is still committed)
            print(f"Warning: Rollup or event queue failed after import: {exc}")

    # Session commit is owned by get_db after successful response.
    # SSE events are emitted by get_db() only if commit succeeds.
    return DprOeeImportResponse(
        import_job_id=result.import_job_id,
        status=result.status,
        total_rows=result.row_count,
        success_count=result.success_count,
        error_count=result.error_count,
        message=_import_message(result.status, result.error_summary),
    )


@router.post(
    "/imports/flexible",
    response_model=DprOeeImportResponse,
    dependencies=[Depends(require_permission("imports", "CREATE"))],
    summary="Upload flexible manufacturing data (Excel or CSV)",
    description=(
        "Development/internal endpoint (authentication not yet implemented). "
        "Multipart: Excel/CSV file + plant_id (+ optional uploaded_by). "
        "Auto-detects sheet and headers; maps flexible column names to canonical fields. "
        "Calls ingest_flexible_workbook or ingest_flexible_csv and triggers OEE rollup. "
        "API session commits on success; SSE events emitted after commit."
    ),
    responses={
        400: {"description": "Invalid upload or plant_id"},
        404: {"description": "Plant not found"},
        422: {"description": "Form / file validation error"},
        500: {"description": "Unexpected server error"},
    },
)
async def upload_flexible(
    file: Annotated[UploadFile, File(description="Manufacturing data file (.xlsx/.xlsm/.csv)")],
    plant_id: Annotated[UUID, Form(description="Target plant UUID (required)")],
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
            detail=_safe_detail("File is required"),
        )
    lower = filename.lower()
    is_excel = lower.endswith(_ALLOWED_EXTENSIONS)
    is_csv = lower.endswith(".csv")

    if not (is_excel or is_csv):
        raise HTTPException(
            status_code=400,
            detail=_safe_detail("File must be Excel (.xlsx/.xlsm) or CSV"),
        )

    try:
        content = await file.read()
    except Exception:  # noqa: BLE001
        raise HTTPException(
            status_code=400,
            detail=_safe_detail("Failed to read file"),
        ) from None

    if len(content) == 0:
        raise HTTPException(
            status_code=400,
            detail=_safe_detail("File is empty"),
        )

    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=_safe_detail(f"File exceeds {_MAX_UPLOAD_BYTES / (1024*1024):.0f} MiB limit"),
        )

    try:
        if is_csv:
            # Decode CSV content and ingest
            csv_text = content.decode("utf-8")
            result = ingest_flexible_csv(
                db=db,
                csv_content=csv_text,
                plant_id=plant_id,
                import_job_id=None,
                uploaded_by=uploaded_by,
            )
        else:
            # Excel — write to temp file and ingest
            import tempfile
            from pathlib import Path
            with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
                tmp.write(content)
                tmp_path = Path(tmp.name)
            try:
                result = ingest_flexible_workbook(
                    db=db,
                    file_path=tmp_path,
                    plant_id=plant_id,
                    import_job_id=None,
                    uploaded_by=uploaded_by,
                )
            finally:
                tmp_path.unlink(missing_ok=True)

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

    # Trigger rollup for committed imports with successful records.
    # This ensures oee_snapshots are created/updated, making data visible to dashboard.
    if result.status == "committed" and result.success_count > 0:
        try:
            # Get production_date from the first successful record
            production_date: date | None = None
            if result.production_record_ids:
                rec = db.get(ProductionRecord, result.production_record_ids[0])
                if rec is not None:
                    production_date = rec.production_date

            if production_date is not None:
                # Plant-level rollup aggregates all machines for this plant+date
                plant_snap = rollup_plant_day(db, plant_id, production_date)
                db.flush()

                # Queue event if snapshot was created/updated
                if plant_snap is not None:
                    queue_oee_updated_event(
                        db,
                        scope_type=SCOPE_PLANT,
                        scope_id=plant_id,
                        period_type=PERIOD_DAY,
                        period_start=production_date,
                    )

                # Also rollup individual machines for dashboard drill-down
                machines = db.scalars(
                    select(ProductionRecord.machine_id)
                    .distinct()
                    .where(ProductionRecord.id.in_(result.production_record_ids))
                ).all()

                for machine_id in machines:
                    if machine_id is not None:
                        machine_snap = rollup_machine_day(db, machine_id, production_date)
                        db.flush()
                        if machine_snap is not None:
                            queue_oee_updated_event(
                                db,
                                scope_type=SCOPE_MACHINE,
                                scope_id=machine_id,
                                period_type=PERIOD_DAY,
                                period_start=production_date,
                            )
        except Exception as exc:
            # Log but don't fail the import on rollup/event-queue errors
            # (production data is still committed)
            print(f"Warning: Rollup or event queue failed after import: {exc}")

    # Session commit is owned by get_db after successful response.
    # SSE events are emitted by get_db() only if commit succeeds.
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
    dependencies=[Depends(require_permission("imports", "READ"))],
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
    dependencies=[Depends(require_permission("imports", "READ"))],
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
