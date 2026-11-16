"""Fixture-backed eFD (no network): the agreement, the search and report pages (ADR 0026).

The report pages are real eFD pages (public filings), saved whole on 2026-11-16:

* ``ptr_2c4705cc.html`` and ``ptr_3a779539.html``: Boozman's two reports for 12/08/2025, 12 and
  14 transactions, all owned jointly.
* ``ptr_51455bcd_amendment.html``: "Periodic Transaction Report for 12/08/2025 (Amendment 1)",
  filed 08/24/2026. It restates ``3a779539`` (13 of its 14 rows are identical; one fund's share
  class is corrected) and shares no row with ``2c4705cc``.
* ``ptr_0541be4f_bond.html``: Fetterman, 10/07/2026, two rows: a corporate bond owned by a child,
  with eFD's coupon and maturity under the asset name.
* ``paper_929216d5.html``: a paper report (Blumenthal, 08/31/2026), nine page images.

Annual reports (ADR 0028), saved whole on 2026-11-16:

* ``annual_81060eb2_sanders_2025.html``: Sanders, calendar 2025. 33 asset lines (a retirement
  plan holding funds as 1.1 to 1.n, one "Unascertainable"), two mortgages, income and positions.
* ``annual_7edd491e_johnson_2025.html``: Ron Johnson, calendar 2025, 13 asset lines and no
  liabilities (Part 7 is the filer's "No").
* ``annual_25bb47de_slotkin_2024_amendment.html``: Slotkin, calendar 2024, Amendment 1.

The search rows and the agreement page are built here by hand; they are not recordings.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path
from urllib.parse import parse_qs

import httpx

from ingest.congress_gov import RateLimiter
from ingest.senate_efd import DATA_PATH, HOME_PATH, SEARCH_PATH, EfdClient

FIXTURE_DIR = Path(__file__).resolve().parent

BOOZMAN_A = "2c4705cc-0f3e-4105-9093-f82fcec8bacd"
BOOZMAN_B = "3a779539-8451-49d2-8419-d3eb72c7922a"
BOOZMAN_AMENDMENT = "51455bcd-4966-4e77-b481-09897ada81ae"
FETTERMAN_BOND = "0541be4f-4f96-4d84-8d6f-d349f218bb2a"
PAPER = "929216d5-5dbd-429c-858c-1e9332924627"

SANDERS_2025 = "81060eb2-fc35-4a8c-857d-3220cf411b9b"
JOHNSON_2025 = "7edd491e-0ee4-46cb-acb2-6c9d06b89803"
SLOTKIN_2024_AMENDMENT = "25bb47de-6695-4a3e-8714-49df656bc5fa"
ANNUAL_PAGES = {
    SANDERS_2025: "annual_81060eb2_sanders_2025.html",
    JOHNSON_2025: "annual_7edd491e_johnson_2025.html",
    SLOTKIN_2024_AMENDMENT: "annual_25bb47de_slotkin_2024_amendment.html",
}

PAGES = {
    BOOZMAN_A: "ptr_2c4705cc.html",
    BOOZMAN_B: "ptr_3a779539.html",
    BOOZMAN_AMENDMENT: "ptr_51455bcd_amendment.html",
    FETTERMAN_BOND: "ptr_0541be4f_bond.html",
    PAPER: "paper_929216d5.html",
}

HOME_HTML = (
    '<form method="post"><input type="hidden" name="csrfmiddlewaretoken" value="fixture-token">'
    '<input type="checkbox" name="prohibition_agreement" value="1"></form>'
)


def read(name: str) -> str:
    return (FIXTURE_DIR / name).read_text(encoding="utf-8")


def report_path(report_id: str, kind: str = "ptr") -> str:
    return f"/search/view/{kind}/{report_id}/"


def search_row(
    first: str,
    last: str,
    office: str,
    report_id: str,
    report_for: str,
    filed: str,
    *,
    kind: str = "ptr",
    amendment: int | None = None,
) -> list[str]:
    """One row as the search JSON carries it: [first, last, office, link, filed]."""
    title = f"Periodic Transaction Report for {report_for}"
    if amendment:
        title += f" (Amendment {amendment})"
    link = f'<a href="{report_path(report_id, kind)}" target="_blank">{title}</a>'
    return [first, last, office, link, filed]


class FakeEfd:
    """Answers like eFD. ``refuse`` makes every request a 403; ``lapse_once`` sends the first
    search back to the agreement, as a lapsed session is."""

    def __init__(
        self,
        rows: Sequence[list[str]],
        pages: dict[str, str] | None = None,
        *,
        refuse: bool = False,
        lapse_once: bool = False,
    ) -> None:
        self.rows = list(rows)
        self.pages = (
            pages
            if pages is not None
            else {k: read(v) for k, v in {**PAGES, **ANNUAL_PAGES}.items()}
        )
        self.refuse = refuse
        self.lapse = lapse_once
        self.agreed = 0
        self.searches: list[dict[str, list[str]]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if self.refuse:
            return httpx.Response(403, text="Access Denied")
        path = request.url.path
        if path == HOME_PATH and request.method == "GET":
            return httpx.Response(200, text=HOME_HTML)
        if path == HOME_PATH and request.method == "POST":
            form = parse_qs(request.content.decode())
            if form.get("prohibition_agreement") != ["1"]:
                return httpx.Response(200, text=HOME_HTML)
            self.agreed += 1
            return httpx.Response(
                302,
                headers={"Location": SEARCH_PATH, "Set-Cookie": "csrftoken=fixture-cookie; Path=/"},
            )
        if path == DATA_PATH and request.method == "POST":
            if self.lapse:
                self.lapse = False
                return httpx.Response(302, headers={"Location": f"{HOME_PATH}?next={SEARCH_PATH}"})
            form = parse_qs(request.content.decode())
            self.searches.append(form)
            start, length = int(form["start"][0]), int(form["length"][0])
            body = {
                "draw": 1,
                "recordsTotal": len(self.rows),
                "recordsFiltered": len(self.rows),
                "data": self.rows[start : start + length],
                "result": "ok",
            }
            return httpx.Response(200, text=json.dumps(body))
        for report_id, page in self.pages.items():
            if path.startswith("/search/view/") and path.endswith(f"/{report_id}/"):
                return httpx.Response(200, text=page)
        return httpx.Response(404, text="Not found")


def efd_client(fake: FakeEfd) -> EfdClient:
    return EfdClient(
        transport=httpx.MockTransport(fake),
        limiter=RateLimiter(10_000, period_seconds=1.0),
        sleep=lambda _seconds: None,
    )


# The built mart: none of the tracked senators the legislators fixtures hold has a report here,
# and no report is invented for a real member. The search lists only a filer who is not tracked
# and a former senator, so a correct loader stores nothing and each tracked senator reads
# "no reports on file" once eFD has been read.
def mart_client() -> EfdClient:
    rows = [
        search_row(
            "RICHARD", "BLUMENTHAL", "Senator", PAPER, "08/31/2026", "08/31/2026", kind="paper"
        ),
        search_row(
            "Someone",
            "Former",
            "Former, Someone (Former Senator)",
            BOOZMAN_A,
            "12/08/2025",
            "12/08/2025",
        ),
    ]
    return efd_client(FakeEfd(rows))
