"""fetch_text retry behaviour, using the httpx mock transport (no network)."""

from __future__ import annotations

import httpx
import pytest

from ingest.http import fetch_text


def _client(responses: list[httpx.Response]) -> httpx.Client:
    queue = list(responses)

    def handler(request: httpx.Request) -> httpx.Response:
        return queue.pop(0)

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_returns_body_on_success() -> None:
    client = _client([httpx.Response(200, text="hello")])
    assert fetch_text("https://x.example/f", client=client, sleep=lambda _: None) == "hello"


def test_retries_on_429_then_succeeds() -> None:
    waits: list[float] = []
    client = _client(
        [
            httpx.Response(429, headers={"Retry-After": "7"}),
            httpx.Response(503),
            httpx.Response(200, text="ok"),
        ]
    )
    assert fetch_text("https://x.example/f", client=client, sleep=waits.append) == "ok"
    assert waits == [7.0, 2.0]  # Retry-After honoured, then doubled backoff


def test_gives_up_after_retries() -> None:
    client = _client([httpx.Response(500)] * 3)
    with pytest.raises(httpx.HTTPStatusError):
        fetch_text("https://x.example/f", client=client, retries=2, sleep=lambda _: None)


def test_non_retryable_status_raises_immediately() -> None:
    waits: list[float] = []
    client = _client([httpx.Response(404)])
    with pytest.raises(httpx.HTTPStatusError):
        fetch_text("https://x.example/f", client=client, sleep=waits.append)
    assert waits == []
