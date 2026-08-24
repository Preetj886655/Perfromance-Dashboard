"""Patil Manufacturing Analytics — FastAPI application entrypoint."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, dashboard, health, imports, masters, production_records, users
from app.core.config import settings
from app.db.bootstrap_admin import ensure_super_admin
from app.db.session import get_session_factory


def _bootstrap_configured_admin() -> None:
    """Create the initial SUPER_ADMIN when Render bootstrap variables are configured.

    This is intentionally opt-in: no admin is created when the bootstrap variables
    are absent. The operation is idempotent and will not modify an existing admin.
    """
    email = (os.getenv("APP_BOOTSTRAP_EMAIL") or "").strip()
    employee_code = (os.getenv("APP_BOOTSTRAP_EMPLOYEE_CODE") or "").strip()
    password = os.getenv("APP_BOOTSTRAP_PASSWORD") or ""

    if not email and not employee_code and not password:
        return

    if not email or not employee_code or not password:
        raise RuntimeError(
            "APP_BOOTSTRAP_EMAIL, APP_BOOTSTRAP_EMPLOYEE_CODE and "
            "APP_BOOTSTRAP_PASSWORD must all be set together."
        )

    session_factory = get_session_factory()
    with session_factory() as db:
        created = ensure_super_admin(
            db,
            email=email,
            employee_code=employee_code,
            password=password,
        )
        if created:
            db.commit()
            print(f"Initial SUPER_ADMIN created for employee {employee_code}.")
        else:
            db.rollback()
            print("SUPER_ADMIN already exists; bootstrap made no changes.")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Alembic migrations run before Uvicorn on Render. Once the schema is ready,
    # optionally create the first SUPER_ADMIN from Render environment variables.
    _bootstrap_configured_admin()
    yield
    # Shutdown: nothing to tear down yet


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=(
        "PRIL Manufacturing Analytics API. "
        "Development/internal: authentication and RBAC are not yet implemented. "
        "Do not expose beyond trusted environments without auth."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["health"])
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(imports.router)
app.include_router(masters.router)
app.include_router(production_records.router)
app.include_router(dashboard.router)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": settings.app_name,
        "phase": "2-dashboard-api",
        "docs": "/docs",
        "health": "/api/v1/health",
        "security": "development/internal — auth not implemented",
    }
