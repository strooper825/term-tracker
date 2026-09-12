"""Shape of the unitedstates/congress-legislators YAML files, as this project relies on it.

Only the fields the pipeline reads are declared; everything else is allowed through
(``extra="allow"``) because the raw payload is stored verbatim. A missing or mistyped declared
field is a shape change upstream and must stop the run (plan section 11, "no silent
assumptions"), which the source module turns into :class:`SourceShapeError`.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _Model(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)


class LegislatorId(_Model):
    bioguide: str = Field(min_length=7, max_length=7)
    govtrack: int | None = None
    icpsr: int | None = None
    fec: list[str] = Field(default_factory=list)


class LegislatorName(_Model):
    first: str
    last: str
    official_full: str | None = None


class Term(_Model):
    type: Literal["rep", "sen"]
    start: date
    end: date
    state: str = Field(min_length=2, max_length=2)
    district: int | None = None  # House only; 0 means at-large
    senate_class: int | None = Field(default=None, alias="class")  # Senate only
    party: str | None = None
    state_rank: str | None = None  # Senate only: junior / senior


class Legislator(_Model):
    id: LegislatorId
    name: LegislatorName
    terms: list[Term] = Field(min_length=1)


class Subcommittee(_Model):
    name: str
    thomas_id: str  # two-character suffix; full id is parent thomas_id + this


class Committee(_Model):
    type: Literal["house", "senate", "joint"]
    name: str
    thomas_id: str
    subcommittees: list[Subcommittee] = Field(default_factory=list)


class MembershipEntry(_Model):
    bioguide: str = Field(min_length=7, max_length=7)
    name: str | None = None
    party: str | None = None
    rank: int | None = None
    title: str | None = None
