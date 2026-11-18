"""Shape of an openstates/people person file, as the States section relies on it (ADR 0035).

Only the fields the pipeline reads are declared; the rest pass through (``extra="allow"``)
because the raw payload is stored verbatim. Checked against the repository on 2026-11-17
(commit bcdda40): every file has ``id``, ``name`` and ``roles``; ``party`` is a list whose last
entry is the current party, each entry optionally dated; a role's dates are ISO strings, and 850
of 10,267 legislative roles carry no ``start_date``.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class _Model(BaseModel):
    model_config = ConfigDict(extra="allow")


class Party(_Model):
    name: str = Field(min_length=1)
    start_date: date | None = None
    end_date: date | None = None


class Role(_Model):
    type: str
    district: str | int | None = None
    jurisdiction: str
    start_date: date | None = None
    end_date: date | None = None


class Person(_Model):
    id: str = Field(pattern=r"^ocd-person/[0-9a-f-]{36}$")
    name: str = Field(min_length=1)
    party: list[Party] = Field(default_factory=list)
    roles: list[Role] = Field(min_length=1)
    image: str | None = None


class CommitteeMember(_Model):
    name: str = Field(min_length=1)
    role: str | None = None
    person_id: str | None = None


class Committee(_Model):
    """A file in ``data/{state}/committees/``. ``chamber`` is upper, lower, or legislature for a
    joint committee; 34,160 of 44,152 memberships carried a person_id on 2026-11-17."""

    id: str = Field(pattern=r"^ocd-organization/[0-9a-f-]{36}$")
    name: str = Field(min_length=1)
    chamber: str
    members: list[CommitteeMember] = Field(default_factory=list)
