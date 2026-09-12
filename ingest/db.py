"""psycopg connection for loads, sharing the API's DATABASE_URL setting."""

from __future__ import annotations

import psycopg

from api.config import get_settings


def connect() -> psycopg.Connection:
    """Open a psycopg connection. DATABASE_URL is a SQLAlchemy URL; psycopg wants the plain form."""
    url = get_settings().database_url.replace("postgresql+psycopg://", "postgresql://", 1)
    return psycopg.connect(url)
