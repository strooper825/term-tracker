"""Application settings, read from the environment or a local ``.env`` file."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

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
    # The one Congress the ingest fetches. dbt/dbt_project.yml carries the same number for the
    # mart and tests/test_rollover.py fails if they differ; changing it is docs/rollover-runbook.md.
    current_congress: int = 119
    # How the bills source reads Congress.gov (ADR 0023). "full": the tracked members' lists,
    # then every bill in scope re-read. "incremental": the whole Congress, only what the bill
    # list says changed, through meta.bill_refresh_queue. The nightly takes it from the
    # repository variable BILL_INGEST_MODE, so switching (either way) is not a code change.
    bill_ingest_mode: Literal["full", "incremental"] = "full"
    # Incremental mode stops reading queued bills after this many requests in one run and
    # leaves the rest queued: 9,000 is under two hours at 5,000 an hour.
    bill_request_budget: int = 9000

    # Ingestion (OpenFEC, Phase 2). Same api.data.gov key scheme; see .env.example.
    fec_api_key: str | None = None
    fec_requests_per_hour: int = 1000  # documented per-key limit
    fec_requests_per_minute: int = 60  # X-RateLimit-Limit reported by the API (2026-09-13)

    # Ingestion (Census Bureau). The Data API refuses a request with no key (checked 2026-09-20),
    # whatever its user guide says about a keyless daily allowance. The key travels in the URL
    # query, so the client never logs a URL (ingest/census.py).
    census_api_key: str | None = None
    census_geography_year: int = 2025  # vintage of the cartographic boundary files
    census_acs_year: int = 2024  # last year of the ACS 5-year estimates (2020-2024)

    @property
    def fec_cycle(self) -> int:
        """The two-year election cycle that ends with the current Congress (119 -> 2026)."""
        return 1788 + 2 * self.current_congress


@lru_cache
def get_settings() -> Settings:
    return Settings()
