"""HTTP fetching with retry and backoff (plan section 3, principle 4)."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable

import httpx

log = logging.getLogger("ingest.http")

USER_AGENT = "term-tracker/0.1 (+https://github.com/strooper825/term-tracker)"
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})


def fetch_text(
    url: str,
    *,
    client: httpx.Client | None = None,
    retries: int = 5,
    timeout: float = 30.0,
    sleep: Callable[[float], None] = time.sleep,
) -> str:
    """GET ``url`` and return the body as text.

    Retries transport errors and 429/5xx responses with exponential backoff, honouring a
    numeric ``Retry-After`` header. Any other non-2xx status raises immediately.
    """
    own_client = client is None
    client = client or httpx.Client(
        headers={"User-Agent": USER_AGENT}, timeout=timeout, follow_redirects=True
    )
    delay = 1.0
    try:
        for attempt in range(retries + 1):
            try:
                response = client.get(url)
            except httpx.TransportError as exc:
                if attempt == retries:
                    raise
                log.warning("GET %s failed (%s); retrying in %.0fs", url, exc, delay)
                sleep(delay)
                delay *= 2
                continue

            if response.status_code in RETRY_STATUSES and attempt < retries:
                retry_after = response.headers.get("Retry-After", "")
                wait = float(retry_after) if retry_after.isdigit() else delay
                log.warning("GET %s -> %s; retrying in %.0fs", url, response.status_code, wait)
                sleep(wait)
                delay *= 2
                continue

            response.raise_for_status()
            return response.text
        raise RuntimeError("unreachable")  # pragma: no cover
    finally:
        if own_client:
            client.close()
