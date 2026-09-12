"""Shape of the Congress.gov API v3 responses this project relies on.

Declared fields are the ones read by the loader or by dbt; everything else passes through
(``extra="allow"``) and is stored verbatim. A missing or mistyped declared field stops the
run (plan section 11).

Known quirk, verified 2026-09-12: on ``/member/{id}/cosponsored-legislation`` the item's
``introducedDate`` is the date the member cosponsored, not the date the bill was introduced.
The loader therefore never uses list-item dates; bill dates come from the detail endpoint and
cosponsorship dates from ``/cosponsors``.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class _Model(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)


class Pagination(_Model):
    count: int
    next: str | None = None


class LatestAction(_Model):
    actionDate: str | None = None
    text: str | None = None


class MemberLegislationItem(_Model):
    """One item of sponsored-legislation / cosponsored-legislation.

    Bills carry ``type`` and ``number``; amendments carry ``amendmentNumber`` and ``type`` null.
    ``url`` is present on both and is what the loader keys on.
    """

    congress: int
    url: str
    title: str | None = None
    type: str | None = None
    number: str | None = None
    amendmentNumber: str | None = None
    introducedDate: str | None = None
    latestAction: LatestAction | None = None
    policyArea: dict[str, Any] | None = None


class BillDetail(_Model):
    congress: int
    type: str
    number: str
    title: str
    introducedDate: str
    updateDate: str
    latestAction: LatestAction | None = None
    policyArea: dict[str, Any] | None = None
    originChamber: str | None = None
    sponsors: list[dict[str, Any]] = Field(default_factory=list)


class AmendmentDetail(_Model):
    congress: int
    type: str
    number: str
    updateDate: str
    submittedDate: str | None = None
    latestAction: LatestAction | None = None
    description: str | None = None
    purpose: str | None = None
    amendedBill: dict[str, Any] | None = None
    sponsors: list[dict[str, Any]] = Field(default_factory=list)


class Action(_Model):
    actionDate: str
    text: str | None = None  # amendment actions can omit it
    actionCode: str | None = None
    type: str | None = None
    sourceSystem: dict[str, Any] | None = None


class Cosponsor(_Model):
    bioguideId: str
    sponsorshipDate: str
    isOriginalCosponsor: bool
    sponsorshipWithdrawnDate: str | None = None


Role = Literal["sponsor", "cosponsor"]
