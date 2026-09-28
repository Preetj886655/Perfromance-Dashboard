"""Application settings loaded from environment variables."""

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env relative to this file so it works regardless of the CWD
# from which uvicorn is launched (e.g., project root vs backend/).
_ENV_FILE = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Patil Manufacturing Analytics API"
    app_env: str = "development"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://patilgroup-perfromance-dashboard.vercel.app",
        "https://patilgroup-perfromance-dashboard-git-main-patil-group.vercel.app",
        "https://patilgroup-perfromance-dashboard-iad1s4qau-patil-group.vercel.app",
    ]

    auth_secret_key: str = ""
    auth_algorithm: str = "HS256"
    auth_access_token_expire_minutes: int = 60

    google_sheets_spreadsheet_id: str = ""
    google_sheets_worksheet_name: str = ""
    google_sheets_default_worksheet: str = "Sheet1"
    google_sheets_cache_ttl_seconds: int = 45

    # Google Sheets service-account credential (file path or inline JSON).
    # Can be set via env var GOOGLE_SERVICE_ACCOUNT_JSON or in .env file.
    google_service_account_json: str = ""
    google_service_account_file: str = ""
    google_service_account_credentials: str = ""
    google_sheets_credentials_json: str = ""
    google_sheets_service_account_json: str = ""

    # PostgreSQL — credentials come from env; never commit real secrets
    # Prefer 127.0.0.1 over localhost so clients do not resolve to a different
    # stack via IPv6 when both a host Postgres and Docker publish listeners.
    postgres_host: str = "127.0.0.1"
    # Match docker-compose host publish default (5433) — avoids Windows service on 5432.
    postgres_port: int = 5433
    postgres_db: str = "pril_analytics"
    postgres_user: str = "pril"
    postgres_password: str = "pril_dev_password"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
