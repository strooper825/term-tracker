"""Shape of the MIT Election Data and Science Lab constituency-returns files (verified 2026-09-14).

One row per candidate per party line (and, where a state reports it, per voting mode) per
contest. Declared fields are the ones the loader keys on or dbt reads; other columns pass
through and are stored verbatim. A missing or unparseable declared field stops the run
(plan section 11).

Spellings vary across the files and years: ``stage`` is ``gen`` or ``GEN``, ``mode`` is
``total`` or ``TOTAL``, booleans are ``True``/``False`` (Senate) or ``TRUE``/``FALSE`` (House).
The two files also differ in shape: the Senate file is comma-separated with ``party_detailed``
and ``party_simplified``; the House file, although Dataverse names it ``.tab``, is
comma-separated with ``party`` plus ``runoff`` and ``fusion_ticket``. The party column is
therefore declared per snapshot in the source module rather than here. Pseudo-candidates such as
``UNDERVOTES``, ``OVER VOTES``, ``SCATTERING`` and ``OTHER`` share the candidate column; dbt
classifies them (macro ``election_vote_kind``).
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

BOOLEAN = "^(?i:true|false)$"


class ElectionReturnRow(BaseModel):
    model_config = ConfigDict(extra="allow")

    year: int = Field(ge=1976)
    state_po: str = Field(pattern="^[A-Z]{2}$")
    office: str
    district: str = Field(min_length=1)
    stage: str = Field(min_length=1)
    special: str = Field(pattern=BOOLEAN)
    candidate: str
    writein: str = Field(pattern=BOOLEAN)
    mode: str
    # -1 (and a candidatevotes of 1 beside it) marks an uncontested race whose votes the state
    # did not count, per the House codebook (Florida and Oklahoma; three rows in version 15.0).
    candidatevotes: float = Field(ge=-1)
    totalvotes: float = Field(ge=-1)

    @field_validator("candidatevotes", "totalvotes", mode="before")
    @classmethod
    def _number(cls, value: object) -> object:
        # The files write counts as 7310.0; an empty cell is a shape change, not a zero.
        if isinstance(value, str) and value.strip() == "":
            raise ValueError("empty vote count")
        return value
