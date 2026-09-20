"""HTTP fetching with retry and backoff (plan section 3, principle 4)."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable

import httpx

log = logging.getLogger("ingest.http")

USER_AGENT = "term-tracker/0.1 (+https://github.com/strooper825/term-tracker)"
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})


def fetch_response(
    url: str,
    *,
    client: httpx.Client | None = None,
    retries: int = 5,
    timeout: float = 30.0,
    sleep: Callable[[float], None] = time.sleep,
    log_url: str | None = None,
) -> httpx.Response:
    """GET ``url`` and return the response.

    Retries transport errors and 429/5xx responses with exponential backoff, honouring a
    numeric ``Retry-After`` header. Any other non-2xx status raises immediately.

    ``log_url`` is what log lines and the raised status error name instead of ``url``. Pass it
    when ``url`` carries a credential (the Census API takes its key as a query parameter), so
    the key reaches neither the run log nor ``meta.ingest_run.error``.
    """
    shown = log_url or url
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
                    if log_url:
                        raise httpx.TransportError(
                            f"GET {shown} failed: {type(exc).__name__}"
                        ) from None
                    raise
                log.warning(
                    "GET %s failed (%s); retrying in %.0fs",
                    shown,
                    type(exc).__name__ if log_url else exc,
                    delay,
                )
                sleep(delay)
                delay *= 2
                continue

            if response.status_code in RETRY_STATUSES and attempt < retries:
                retry_after = response.headers.get("Retry-After", "")
                wait = float(retry_after) if retry_after.isdigit() else delay
                log.warning("GET %s -> %s; retrying in %.0fs", shown, response.status_code, wait)
                sleep(wait)
                delay *= 2
                continue

            if log_url and response.is_error:
                raise httpx.HTTPStatusError(
                    f"GET {shown} -> HTTP {response.status_code}",
                    request=response.request,
                    response=response,
                ) from None
            response.raise_for_status()
            return response
        raise RuntimeError("unreachable")  # pragma: no cover
    finally:
        if own_client:
            client.close()


def fetch_text(
    url: str,
    *,
    client: httpx.Client | None = None,
    retries: int = 5,
    timeout: float = 30.0,
    sleep: Callable[[float], None] = time.sleep,
    log_url: str | None = None,
) -> str:
    """GET ``url`` and return the body as text. See :func:`fetch_response`."""
    return fetch_response(
        url, client=client, retries=retries, timeout=timeout, sleep=sleep, log_url=log_url
    ).text
