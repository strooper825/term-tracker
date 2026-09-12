"""Application settings, read from the environment or a local ``.env`` file."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8-sig",  # tolerate a BOM written by Windows editors
        extra="ignore",  # .env also carries ingestion keys the API does not use
    )

    database_url: str = "postgresql+psycopg://term:term@localhost:5433/term_tracker"


@lru_cache
def get_settings() -> Settings:
    return Settings()
