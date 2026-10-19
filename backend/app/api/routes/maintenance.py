"""Maintenance & Breakdown Google Sheets API endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.rbac import seed_role_catalog, user_has_permission
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.maintenance_sheets_service import (
    fetch_maintenance_dataset,
    get_maintenance_status,
)

router = APIRouter(prefix="/api", tags=["maintenance"])


def require_maintenance_access():
    """Requires either maintenance:READ or dashboard:READ permission."""

    def dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        seed_role_catalog(db)
        if not current_user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
            )
        if user_has_permission(db, current_user, "maintenance", "READ") or user_has_permission(
            db, current_user, "dashboard", "READ"
        ):
            return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: Maintenance or Dashboard access required",
        )

    return dependency


@router.get(
    "/maintenance/status",
    dependencies=[Depends(require_maintenance_access())],
)
def read_maintenance_status(
    spreadsheet_id: str | None = Query(default=None, description="Google Spreadsheet ID"),
    worksheet: str | None = Query(default=None, description="Optional worksheet name or title"),
) -> dict[str, Any]:
    return get_maintenance_status(spreadsheet_id=spreadsheet_id, worksheet_name=worksheet)


@router.get(
    "/maintenance/data",
    dependencies=[Depends(require_maintenance_access())],
)
def read_maintenance_data(
    spreadsheet_id: str | None = Query(default=None, description="Google Spreadsheet ID"),
    worksheet: str | None = Query(default=None, description="Optional worksheet name or title"),
    refresh: bool = Query(
        default=False, description="Bypass the in-memory cache and fetch fresh data"
    ),
) -> dict[str, Any]:
    try:
        return fetch_maintenance_dataset(
            spreadsheet_id=spreadsheet_id, worksheet_name=worksheet, refresh=refresh
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get(
    "/v1/maintenance/status",
    dependencies=[Depends(require_maintenance_access())],
)
def read_maintenance_status_v1(
    spreadsheet_id: str | None = Query(default=None, description="Google Spreadsheet ID"),
    worksheet: str | None = Query(default=None, description="Optional worksheet name or title"),
) -> dict[str, Any]:
    return get_maintenance_status(spreadsheet_id=spreadsheet_id, worksheet_name=worksheet)


@router.get(
    "/v1/maintenance/data",
    dependencies=[Depends(require_maintenance_access())],
)
def read_maintenance_data_v1(
    spreadsheet_id: str | None = Query(default=None, description="Google Spreadsheet ID"),
    worksheet: str | None = Query(default=None, description="Optional worksheet name or title"),
    refresh: bool = Query(
        default=False, description="Bypass the in-memory cache and fetch fresh data"
    ),
) -> dict[str, Any]:
    try:
        return fetch_maintenance_dataset(
            spreadsheet_id=spreadsheet_id, worksheet_name=worksheet, refresh=refresh
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

