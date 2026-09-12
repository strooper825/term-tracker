"""FastAPI application entry point (``uvicorn api.main:app``)."""

from __future__ import annotations

from fastapi import FastAPI

from api.routers import meta

API_PREFIX = "/api/v1"

app = FastAPI(
    title="Term Tracker API",
    version="0.1.0",
    description=(
        "Read-only JSON API behind the congressional term dashboards. "
        "Every response carries `sources[]` with URLs and `fetched_at` for provenance."
    ),
)

app.include_router(meta.router, prefix=API_PREFIX)
