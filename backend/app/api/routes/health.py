"""Health-check routes for Phase 1 foundation."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.db.session import check_database_connection
from app.services.google_sheets_service import get_google_sheet_status

router = APIRouter(prefix="/api/v1")


@router.get("/health")
def health() -> dict:
    db_ok = False
    db_error: str | None = None
    try:
        db_ok = check_database_connection()
    except Exception as exc:  # noqa: BLE001 — surface connection errors in health payload
        db_error = str(exc)

    # Google Sheets status (non-blocking — do not fail health check if Sheets is unavailable)
    sheets_status = None
    try:
        sheets_status = get_google_sheet_status()
    except Exception:
        sheets_status = {
            "connectionStatus": "offline",
            "error": "Google Sheets status check failed",
        }

    payload = {
        "status": "ok" if db_ok else "degraded",
        "service": settings.app_name,
        "environment": settings.app_env,
        "phase": "2-dashboard-api",
        "database": {
            "connected": db_ok,
            "host": settings.postgres_host,
            "port": settings.postgres_port,
            "name": settings.postgres_db,
            "error": db_error,
        },
        "googleSheets": sheets_status,
    }

    if not db_ok:
        return JSONResponse(status_code=503, content=payload)
    return payload
