"""SQLAlchemy engine and the per-request session dependency."""

from __future__ import annotations

import asyncio
import weakref
from collections.abc import AsyncIterator
from functools import lru_cache

from anyio import to_thread
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from api.config import get_settings

POOL_SIZE = 5
MAX_OVERFLOW = 10
# Sessions allowed at once: never more than the pool can hand out. A request past this waits on the
# event loop, holding neither a worker thread nor a connection. Without the cap, requests that
# cannot get a connection block worker threads (FastAPI runs endpoints, response serialising and a
# plain generator dependency's cleanup in the same pool of 40), the finished requests that hold
# the connections need one of those threads to serialise and close, and nothing moves until the
# pool's 30 second wait turns the waiters into HTTP 500s. That is what failed the 2026-09-20
# deploy: pg_stat_activity showed all 15 connections "idle in transaction" for 28 seconds, each
# on a query that had already returned (docs/verification-notes.md).
SESSION_SLOTS = POOL_SIZE + MAX_OVERFLOW

_slots: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore] = (
    weakref.WeakKeyDictionary()
)


def _slots_for(loop: asyncio.AbstractEventLoop) -> asyncio.Semaphore:
    semaphore = _slots.get(loop)
    if semaphore is None:
        semaphore = _slots[loop] = asyncio.Semaphore(SESSION_SLOTS)
    return semaphore


@lru_cache
def get_engine() -> Engine:
    return create_engine(
        get_settings().database_url,
        pool_pre_ping=True,
        pool_size=POOL_SIZE,
        max_overflow=MAX_OVERFLOW,
    )


async def get_session() -> AsyncIterator[Session]:
    async with _slots_for(asyncio.get_running_loop()):
        session = Session(get_engine())
        try:
            yield session
        finally:
            await to_thread.run_sync(session.close)
