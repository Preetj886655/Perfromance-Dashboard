"""Health-check routes for Phase 1 foundation."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.db.session import check_database_connection

router = APIRouter(prefix="/api/v1")


@router.get("/health")
def health() -> dict:
    db_ok = False
    db_error: str | None = None
    try:
        db_ok = check_database_connection()
    except Exception as exc:  # noqa: BLE001 — surface connection errors in health payload
        db_error = str(exc)

    payload = {
        "status": "ok" if db_ok else "degraded",
        "service": settings.app_name,
        "environment": settings.app_env,
        "phase": "1-foundation",
        "database": {
            "connected": db_ok,
            "host": settings.postgres_host,
            "port": settings.postgres_port,
            "name": settings.postgres_db,
            "error": db_error,
        },
    }

    if not db_ok:
        return JSONResponse(status_code=503, content=payload)
    return payload
