"""Application settings loaded from environment variables."""

import os
from functools import lru_cache

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

# Resolve .env relative to this file so it works regardless of the CWD
# from which uvicorn is launched (e.g., project root vs backend/).
_ENV_FILE = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
DEFAULT_AUTH_SECRET_KEY = "dev-token-secret"


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
    auth_access_token_expire_minutes: int = 600

    google_sheets_spreadsheet_id: str = ""
    google_sheets_worksheet_name: str = ""
    google_sheets_default_worksheet: str = "Sheet1"
    google_sheets_cache_ttl_seconds: int = 45

    maintenance_spreadsheet_id: str = "1u4ZaYcrJym_wbDpNE0iHdXBcGJOR1kLww7G6XwOSrWs"
    maintenance_worksheet_name: str = "Beakdown"

    # ERC Mk-V Line Tracker configuration (local Excel file or Google Sheets)
    line_tracker_local_path: str = r"C:\Users\Preet Jaiswal\Downloads\ERC_MkV_Line_Tracker R0_10102026.xlsx"
    # Live source spreadsheet (the ".xlsx" in the repo is a DOWNLOAD of this Google Sheet).
    line_tracker_spreadsheet_id: str = "1axzlqa-0nga1nnLSOZ1HQpjFZzx1kUlQ-KrqJgblw-s"
    line_tracker_worksheet_name: str = ""
    # "local_excel" (default, uses the downloaded .xlsx, no Google calls) or
    # "google_sheets" (reads the live Google Sheet via the service account, falls back
    # to local Excel automatically if the sheet can't be fetched).
    line_tracker_source: str = "local_excel"
    line_tracker_cache_ttl_seconds: int = 300

    # AI Chatbot configuration
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-20b"
    openai_api_key: str = ""
    hf_token: str = ""
    hf_router_url: str = "https://router.huggingface.co/v1"
    chat_provider: str = "auto"  # "auto", "groq", "hf", "openai", "deterministic"
    chat_model: str = "openai/gpt-oss-120b"
    chat_fallback_enabled: bool = True
    chat_timezone: str = "Asia/Kolkata"

    # Google Sheets service-account credential (file path or inline JSON).
    # Can be set via env var GOOGLE_SERVICE_ACCOUNT_JSON or in .env file.
    google_service_account_json: str = ""
    google_service_account_file: str = ""
    google_service_account_credentials: str = ""
    google_sheets_credentials_json: str = ""
    google_sheets_service_account_json: str = ""

    # Prefer the Supabase session-pooler URL in production. POSTGRES_* remains
    # supported for local Docker Compose development.
    database_url_value: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DATABASE_URL", "POSTGRES_URL"),
    )

    # PostgreSQL — credentials come from env; never commit real secrets
    # Prefer 127.0.0.1 over localhost so clients do not resolve to a different
    # stack via IPv6 when both a host Postgres and Docker publish listeners.
    postgres_host: str = "127.0.0.1"
    # Match docker-compose host publish default (5433) — avoids Windows service on 5432.
    postgres_port: int = 5433
    postgres_db: str = "pril_analytics"
    postgres_user: str = "pril"
    postgres_password: str = "pril_dev_password"

    @model_validator(mode="after")
    def validate_production_auth_secret(self) -> "Settings":
        if self.app_env.strip().lower() == "production" and not self.auth_secret_key.strip():
            raise ValueError(
                "AUTH_SECRET_KEY must be configured when APP_ENV=production. "
                "Use one stable secret for every Render instance."
            )
        return self

    @property
    def database_url(self) -> str:
        if self.database_url_value:
            raw_url = self.database_url_value.strip()
            if raw_url.startswith("postgres://"):
                raw_url = "postgresql://" + raw_url[len("postgres://") :]

            parsed_url = make_url(raw_url)
            if parsed_url.drivername in {"postgresql", "postgresql+asyncpg"}:
                parsed_url = parsed_url.set(drivername="postgresql+psycopg")
            return parsed_url.render_as_string(hide_password=False)

        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
