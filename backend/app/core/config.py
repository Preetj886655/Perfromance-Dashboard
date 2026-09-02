"""Application settings loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Patil Manufacturing Analytics API"
    app_env: str = "development"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    auth_secret_key: str = ""
    auth_algorithm: str = "HS256"
    auth_access_token_expire_minutes: int = 60

    google_sheets_spreadsheet_id: str = ""
    google_sheets_default_worksheet: str = "Sheet1"
    google_sheets_cache_ttl_seconds: int = 45

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
