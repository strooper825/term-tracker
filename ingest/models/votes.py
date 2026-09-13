"""Shape of the two roll-call vote sources, as this project relies on it (verified 2026-09-12).

House: Congress.gov ``/house-vote/{congress}/{session}`` list items and
``/house-vote/{congress}/{session}/{roll}/members`` (all member positions under ``results``).
Senate: senate.gov ``vote_menu_{c}_{s}.xml`` and ``vote_{c}_{s}_{n}.xml`` parsed to dicts
with ``vote`` and ``member`` always as lists.

Position vocabulary seen upstream: House ``Yea``/``Nay``, ``Aye``/``No`` (recorded votes),
``Present``, ``Not Voting``, and candidate names on Speaker elections; Senate ``Yea``,
``Nay``, ``Present``, ``Not Voting`` (and ``Guilty``/``Not Guilty`` in impeachment trials).
Normalisation happens in dbt (macro ``normalize_position``); see ADR 0004.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class _Model(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)


class HouseVoteListItem(_Model):
    congress: int
    sessionNumber: int
    rollCallNumber: int
    url: str
    startDate: str | None = None
    updateDate: str | None = None
    result: str | None = None
    voteType: str | None = None
    legislationType: str | None = None
    legislationNumber: str | None = None
    legislationUrl: str | None = None
    sourceDataURL: str | None = None


class HouseMemberVote(_Model):
    bioguideID: str = Field(min_length=7, max_length=7)
    voteCast: str
    voteParty: str | None = None
    voteState: str | None = None


class HouseVoteMembers(_Model):
    congress: int
    sessionNumber: int
    rollCallNumber: int
    results: list[HouseMemberVote] = Field(min_length=1)
    voteQuestion: str | None = None
    updateDate: str | None = None


class SenateMenuVote(_Model):
    vote_number: str
    vote_date: str | None = None
    issue: str | None = None
    # Plain text, or for amendment votes mixed content such as
    # <question>On the Amendment<measure>S.Amdt. 14</measure></question>, which xmltodict
    # returns as {"#text": ..., "measure": ...}. Seen on first run, 2026-09-12.
    question: str | dict[str, Any] | None = None
    result: str | None = None
    title: str | None = None


class SenateMenuVotes(_Model):
    vote: list[SenateMenuVote] = Field(default_factory=list)


class SenateMenu(_Model):
    congress: str
    session: str
    congress_year: str | None = None
    votes: SenateMenuVotes | None = None


class SenateMemberVote(_Model):
    lis_member_id: str
    vote_cast: str
    party: str | None = None
    state: str | None = None
    last_name: str | None = None
    first_name: str | None = None


class SenateMembers(_Model):
    member: list[SenateMemberVote] = Field(min_length=1)


class SenateVote(_Model):
    congress: str
    session: str
    vote_number: str
    vote_date: str
    question: str | None = None
    vote_question_text: str | None = None
    vote_result: str | None = None
    majority_requirement: str | None = None
    # One <document>, or a list of them on en bloc votes (e.g. 48 nominations under one
    # cloture motion). Seen on first run, 2026-09-12.
    document: dict[str, Any] | list[dict[str, Any]] | None = None
    count: dict[str, Any] | None = None
    members: SenateMembers
