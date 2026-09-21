"""Shape of the House Clerk files this project reads (verified 2026-09-20).

* ``{year}FD.zip`` holds ``{year}FD.txt``, tab separated with the header row below, and an XML
  copy of the same rows. ``FilingType`` ``P`` is a Periodic Transaction Report; the others are
  annual reports (``O``, ``C``, ``A``), extensions (``X``) and so on. The index carries no
  bioguide id, only a name and ``StateDst`` (state plus two-digit district).
* ``ptr-pdfs/{year}/{DocID}.pdf`` is the report. Electronic filings (DocIDs starting ``2``) have
  a text layer and a transaction table; paper filings (DocIDs starting ``8`` or ``9``) are
  scanned images with no text at all.

Declared fields are the ones the loader reads; a missing one stops the run (plan section 11).
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

INDEX_COLUMNS = (
    "Prefix",
    "Last",
    "First",
    "Suffix",
    "FilingType",
    "StateDst",
    "Year",
    "FilingDate",
    "DocID",
)


class IndexRow(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    prefix: str = Field(alias="Prefix", default="")
    last: str = Field(alias="Last", min_length=1)
    first: str = Field(alias="First", default="")
    suffix: str = Field(alias="Suffix", default="")
    filing_type: str = Field(alias="FilingType", min_length=1, max_length=1)
    state_dst: str = Field(alias="StateDst", default="", pattern=r"^([A-Z]{2}\d{2})?$")
    year: int = Field(alias="Year")
    filing_date: str = Field(alias="FilingDate", pattern=r"^(\d{1,2}/\d{1,2}/\d{4})?$")
    doc_id: str = Field(alias="DocID", pattern=r"^\d+$")

    @property
    def state(self) -> str:
        return self.state_dst[:2]

    @property
    def district(self) -> int | None:
        return int(self.state_dst[2:]) if len(self.state_dst) == 4 else None
