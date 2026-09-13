"""Application settings, read from the environment or a local ``.env`` file."""

from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8-sig",  # tolerate a BOM written by Windows editors
        extra="ignore",  # .env also carries ingestion keys the API does not use
    )

    database_url: str = "postgresql+psycopg://term:term@localhost:5433/term_tracker"

    @field_validator("database_url")
    @classmethod
    def _use_psycopg_driver(cls, value: str) -> str:
        """Accept the plain URL a managed host hands out (postgresql:// or postgres://)."""
        for prefix in ("postgresql://", "postgres://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix) :]
        return value

    # Ingestion (Congress.gov). The key is issued via api.data.gov; see .env.example.
    congress_gov_api_key: str | None = None
    congress_gov_requests_per_hour: int = 5000  # documented per-key limit
    current_congress: int = 119  # keep in step with the dbt var of the same name


@lru_cache
def get_settings() -> Settings:
    return Settings()
