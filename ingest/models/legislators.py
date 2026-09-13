"""Shape of the unitedstates/congress-legislators YAML files, as this project relies on it.

Only the fields the pipeline reads are declared; everything else is allowed through
(``extra="allow"``) because the raw payload is stored verbatim. A missing or mistyped declared
field is a shape change upstream and must stop the run (plan section 11, "no silent
assumptions"), which the source module turns into :class:`SourceShapeError`.

Verified against the live file on 2026-09-13 (539 records): every record carries ``bio`` with
``birthday`` and ``gender``; ``name.middle``, ``nickname`` and ``suffix`` are optional;
``leadership_roles`` is present on 40 records; a term carries ``caucus`` when the member is an
Independent who caucuses with a party, and ``party_affiliations`` when the party changed
during the term.
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
    lis: str | None = None
    fec: list[str] = Field(default_factory=list)
    opensecrets: str | None = None
    wikipedia: str | None = None
    ballotpedia: str | None = None
    cspan: int | None = None
    votesmart: int | None = None
    wikidata: str | None = None


class LegislatorName(_Model):
    first: str
    last: str
    middle: str | None = None
    nickname: str | None = None
    suffix: str | None = None
    official_full: str | None = None


class LegislatorBio(_Model):
    birthday: date | None = None
    gender: Literal["M", "F"] | None = None


class PartyAffiliation(_Model):
    start: date
    end: date
    party: str
    caucus: str | None = None


class Term(_Model):
    type: Literal["rep", "sen"]
    start: date
    end: date
    state: str = Field(min_length=2, max_length=2)
    district: int | None = None  # House only; 0 means at-large
    senate_class: int | None = Field(default=None, alias="class")  # Senate only
    party: str | None = None
    caucus: str | None = None  # Independents: the party they caucus with
    party_affiliations: list[PartyAffiliation] | None = None  # when party changed mid-term
    state_rank: str | None = None  # Senate only: junior / senior
    how: str | None = None  # appointment / special-election when not a regular election
    end_type: str | None = Field(default=None, alias="end-type")  # e.g. death, resignation


class LeadershipRole(_Model):
    title: str
    chamber: Literal["house", "senate"]
    start: date
    end: date | None = None  # absent while the role is held


class Legislator(_Model):
    id: LegislatorId
    name: LegislatorName
    bio: LegislatorBio
    terms: list[Term] = Field(min_length=1)
    leadership_roles: list[LeadershipRole] | None = None


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
