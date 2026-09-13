"""Shape of the OpenFEC API v1 responses this project relies on (verified 2026-09-13).

Declared fields are the ones the loader or dbt reads; everything else passes through
(``extra="allow"``) and is stored verbatim. A missing or mistyped declared field stops the
run (plan section 11).

Endpoints:

* ``/candidate/{id}/`` -- one record; ``office`` is ``H``, ``S``, or ``P`` and is also the
  first letter of the candidate id.
* ``/candidate/{id}/committees/?cycle=`` -- committees linked to the candidate in that cycle;
  ``designation`` ``P`` is the principal campaign committee, ``A`` another authorized
  committee, ``J`` joint fundraising, ``D`` leadership PAC.
* ``/committee/{id}/totals/?cycle=`` -- one record per cycle. The cash-on-hand and debt
  figures are the ``last_*`` columns (there is no ``cash_on_hand_end_period`` on this
  endpoint); House and Senate committees both report transfers in
  ``transfers_from_other_authorized_committee``.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class _Model(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)


class Candidate(_Model):
    candidate_id: str = Field(min_length=9, max_length=9)
    name: str
    office: str = Field(pattern="^[HSP]$")
    state: str | None = None
    district: str | None = None
    party: str | None = None
    candidate_status: str | None = None
    cycles: list[int] = Field(default_factory=list)
    election_years: list[int] = Field(default_factory=list)
    active_through: int | None = None
    last_file_date: str | None = None
    load_date: str | None = None


class CandidateCommittee(_Model):
    committee_id: str = Field(min_length=9, max_length=9)
    name: str
    designation: str
    designation_full: str | None = None
    committee_type: str | None = None
    committee_type_full: str | None = None
    cycles: list[int] = Field(default_factory=list)
    candidate_ids: list[str] = Field(default_factory=list)
    last_file_date: str | None = None
    first_file_date: str | None = None
    treasurer_name: str | None = None
    filing_frequency: str | None = None
    party: str | None = None
    state: str | None = None


class CommitteeTotals(_Model):
    committee_id: str
    cycle: int
    coverage_start_date: str | None = None
    coverage_end_date: str | None = None
    last_report_type_full: str | None = None
    last_report_year: int | None = None
    transaction_coverage_date: str | None = None
    last_beginning_image_number: str | None = None
    receipts: float | None = None
    disbursements: float | None = None
    last_cash_on_hand_end_period: float | None = None
    last_debts_owed_by_committee: float | None = None
    individual_contributions: float | None = None
    individual_itemized_contributions: float | None = None
    individual_unitemized_contributions: float | None = None
    political_party_committee_contributions: float | None = None
    other_political_committee_contributions: float | None = None
    candidate_contribution: float | None = None
    loans_made_by_candidate: float | None = None
    transfers_from_other_authorized_committee: float | None = None
    other_receipts: float | None = None
    offsets_to_operating_expenditures: float | None = None
    contributions: float | None = None
    contribution_refunds: float | None = None
    operating_expenditures: float | None = None
