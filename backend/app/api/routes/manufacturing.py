"""Google Sheets-backed manufacturing data endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.rbac import require_permission
from app.services.google_sheets_service import (
    fetch_google_sheet_dataset,
    get_google_sheet_status,
)

router = APIRouter(prefix="/api", tags=["manufacturing"])


@router.get(
    "/manufacturing/status",
    dependencies=[Depends(require_permission("dashboard", "READ"))],
)
def read_manufacturing_status(
    spreadsheet_id: str | None = Query(default=None, description="Google Spreadsheet ID"),
    worksheet: str | None = Query(default=None, description="Optional worksheet name or title"),
) -> dict[str, Any]:
    return get_google_sheet_status(spreadsheet_id=spreadsheet_id, worksheet_name=worksheet)


@router.get(
    "/manufacturing/data",
    dependencies=[Depends(require_permission("dashboard", "READ"))],
)
def read_manufacturing_data(
    spreadsheet_id: str | None = Query(default=None, description="Google Spreadsheet ID"),
    worksheet: str | None = Query(default=None, description="Optional worksheet name or title"),
    refresh: bool = Query(
        default=False, description="Bypass the in-memory cache and fetch fresh data"
    ),
) -> dict[str, Any]:
    try:
        return fetch_google_sheet_dataset(
            spreadsheet_id=spreadsheet_id, worksheet_name=worksheet, refresh=refresh
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get(
    "/v1/manufacturing/status",
    dependencies=[Depends(require_permission("dashboard", "READ"))],
)
def read_manufacturing_status_v1(
    spreadsheet_id: str | None = Query(default=None, description="Google Spreadsheet ID"),
    worksheet: str | None = Query(default=None, description="Optional worksheet name or title"),
) -> dict[str, Any]:
    return get_google_sheet_status(spreadsheet_id=spreadsheet_id, worksheet_name=worksheet)


@router.get(
    "/v1/manufacturing/data",
    dependencies=[Depends(require_permission("dashboard", "READ"))],
)
def read_manufacturing_data_v1(
    spreadsheet_id: str | None = Query(default=None, description="Google Spreadsheet ID"),
    worksheet: str | None = Query(default=None, description="Optional worksheet name or title"),
    refresh: bool = Query(
        default=False, description="Bypass the in-memory cache and fetch fresh data"
    ),
) -> dict[str, Any]:
    try:
        return fetch_google_sheet_dataset(
            spreadsheet_id=spreadsheet_id, worksheet_name=worksheet, refresh=refresh
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

