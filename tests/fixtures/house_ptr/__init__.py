"""Fixture-backed House Clerk client (no network).

The four PDFs are real Clerk files (public filings), kept whole except where noted:

* ``electronic_2_pages.pdf``: Periodic Transaction Report 20033945 (GA-12), four rows, owner codes
  ``SP`` and none, purchases and sales, detail lines spilling onto page 2.
* ``electronic_3_pages_partial_sales.pdf``: 20034201 (MO-4), nine rows over two pages, every one
  ``S (partial)``, a long description under each row, an asset name that wraps onto two lines.
* ``scanned_1_page.pdf``: page 4 of scanned paper filing 9116328, cut to that page. A CCITT
  image with no text layer, the form every filing of the one tracked member with PTRs uses.
* ``text_without_transactions.pdf``: page 3 of 20034201 alone: a text layer and a table header
  but only detail lines, so the reader must refuse it.

The filing index is built here, by hand, from the rows the tests need; it is not a recording.
"""

from __future__ import annotations

import io
import zipfile
from datetime import date
from pathlib import Path

import httpx

from ingest.congress_gov import RateLimiter
from ingest.house_ptr import ClerkClient, index_url, pdf_url
from ingest.models.house_ptr import INDEX_COLUMNS

FIXTURE_DIR = Path(__file__).resolve().parent

ELECTRONIC = "electronic_2_pages.pdf"  # DocID 20033945, header GA12
ELECTRONIC_PARTIAL = "electronic_3_pages_partial_sales.pdf"  # DocID 20034201, header MO04
SCANNED = "scanned_1_page.pdf"
NO_TABLE = "text_without_transactions.pdf"

HEADER = "\t".join(INDEX_COLUMNS)


def read(name: str) -> bytes:
    return (FIXTURE_DIR / name).read_bytes()


def index_row(
    last: str,
    first: str,
    filing_type: str,
    state_dst: str,
    year: int,
    filing_date: str,
    doc_id: str,
    prefix: str = "Hon.",
) -> str:
    return "\t".join(
        [prefix, last, first, "", filing_type, state_dst, str(year), filing_date, doc_id]
    )


def index_archive(year: int, rows: list[str]) -> bytes:
    """A ``{year}FD.zip`` holding the tab-separated index and, like the Clerk's, an XML copy."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        zf.writestr(f"{year}FD.txt", "﻿" + "\r\n".join([HEADER, *rows]) + "\r\n")
        zf.writestr(f"{year}FD.xml", "<FinancialDisclosure/>")
    return buffer.getvalue()


def fixture_fetch(files: dict[str, bytes]):
    """A fetch function answering from ``files`` (URL -> body); anything else is 404."""

    def fetch(url: str) -> bytes:
        body = files.get(url)
        if body is None:
            request = httpx.Request("GET", url)
            raise httpx.HTTPStatusError(
                "404", request=request, response=httpx.Response(404, request=request)
            )
        return body

    return fetch


def clerk_client(files: dict[str, bytes]) -> ClerkClient:
    return ClerkClient(fetch=fixture_fetch(files), limiter=RateLimiter(10_000, period_seconds=1.0))


def files_for(year: int, rows: list[str], pdfs: dict[str, str]) -> dict[str, bytes]:
    """Index archive for ``year`` plus PDFs: ``pdfs`` maps a DocID to a fixture file name."""
    files = {index_url(year): index_archive(year, rows)}
    for doc_id, name in pdfs.items():
        files[pdf_url(year, doc_id)] = read(name)
    return files


# The tracked members the legislators fixtures hold. None of them has a real PTR, and no filing
# is invented for a real member: the built-mart index holds only filers who are not tracked, so a
# correct loader ignores every row and each tracked House member reads "no reports on file".
MART_YEAR = 2026
MART_TODAY = date(2026, 9, 20)
MART_MEMBERS = ["B001230", "C001095", "J000294", "K000401", "S000033", "S001208", "S001213"]


def mart_client() -> ClerkClient:
    rows = [
        index_row("Allen", "Richard W.", "P", "GA12", MART_YEAR, "2/17/2026", "20033945"),
        index_row("Alford", "Mark", "P", "MO04", MART_YEAR, "3/31/2026", "20034201"),
        index_row("Someone", "Else", "O", "TX01", MART_YEAR, "5/1/2026", "10000001"),
    ]
    return clerk_client(
        files_for(
            MART_YEAR,
            rows,
            {"20033945": ELECTRONIC, "20034201": ELECTRONIC_PARTIAL},
        )
    )
