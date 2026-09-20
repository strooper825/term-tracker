"""The per-request session must never make the pool wait on its own finished requests.

Regression tests for the 2026-09-20 deploy failure (docs/verification-notes.md): under load the
API's connections were all held by requests that had already finished their queries, while every
worker thread sat in an endpoint waiting for a connection, so nothing could close a session until
the pool's timeout fired and the waiters got HTTP 500.
"""

from __future__ import annotations

import asyncio
import time
from typing import Annotated

import httpx
import pytest
from anyio import to_thread
from fastapi import Depends, FastAPI
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import QueuePool

from api import db


def _engine(pool: int, wait: float):
    return create_engine(
        "sqlite://",
        poolclass=QueuePool,
        pool_size=pool,
        max_overflow=0,
        pool_timeout=wait,
        connect_args={"check_same_thread": False},
    )


def test_closing_the_dependency_returns_the_connection(monkeypatch: pytest.MonkeyPatch) -> None:
    engine = _engine(2, 1)
    monkeypatch.setattr(db, "get_engine", lambda: engine)

    async def scenario() -> tuple[int, int]:
        dependency = db.get_session()
        session = await dependency.__anext__()
        session.execute(text("select 1"))
        held = engine.pool.checkedout()
        await dependency.aclose()
        return held, engine.pool.checkedout()

    assert asyncio.run(scenario()) == (1, 0)


def test_no_more_sessions_are_open_than_slots(monkeypatch: pytest.MonkeyPatch) -> None:
    engine = _engine(3, 1)
    monkeypatch.setattr(db, "get_engine", lambda: engine)
    monkeypatch.setattr(db, "SESSION_SLOTS", 3)
    peak = 0

    async def request() -> None:
        nonlocal peak
        dependency = db.get_session()
        session = await dependency.__anext__()
        session.execute(text("select 1"))
        peak = max(peak, engine.pool.checkedout())
        await asyncio.sleep(0.02)
        await dependency.aclose()

    async def scenario() -> None:
        await asyncio.gather(*[request() for _ in range(20)])

    asyncio.run(scenario())
    assert peak == 3
    assert engine.pool.checkedout() == 0


def test_a_burst_larger_than_the_pool_and_the_thread_limit_all_succeeds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """60 requests at once against a pool of 3 and 8 worker threads. With the dependency FastAPI
    runs in its own worker threads this failed 53 to 56 of 60 requests after the pool timeout."""
    engine = _engine(3, 3)
    monkeypatch.setattr(db, "get_engine", lambda: engine)
    monkeypatch.setattr(db, "SESSION_SLOTS", 3)
    app = FastAPI()

    @app.get("/q")
    def query(session: Annotated[Session, Depends(db.get_session)]) -> dict:
        session.execute(text("select 1")).all()
        time.sleep(0.02)  # the endpoint keeps working after its query
        return {"ok": True}

    async def scenario() -> tuple[list[int], float]:
        to_thread.current_default_thread_limiter().total_tokens = 8
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://t", timeout=30
        ) as client:
            start = time.time()
            responses = await asyncio.gather(*[client.get("/q") for _ in range(60)])
            return [r.status_code for r in responses], time.time() - start

    statuses, took = asyncio.run(scenario())
    assert statuses == [200] * 60
    assert took < 3  # the pool wait above; the old dependency needed several of them
    assert engine.pool.checkedout() == 0
