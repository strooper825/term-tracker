-- One row per (committee, cycle) totals record from /committee/{id}/totals/?cycle=
-- (raw.fec_committee_totals). Amounts are dollars as the FEC publishes them. Cash on hand and
-- debts are the `last_*` figures (end of the latest report); the endpoint has no
-- cash_on_hand_end_period column. House and Senate committees both report transfers in
-- transfers_from_other_authorized_committee.
select
    committee_id,
    cycle,
    (payload ->> 'coverage_start_date')::date as coverage_start_date,
    (payload ->> 'coverage_end_date')::date as coverage_end_date,
    payload ->> 'last_report_type_full' as last_report_type,
    (payload ->> 'last_report_year')::int as last_report_year,
    payload ->> 'last_beginning_image_number' as last_beginning_image_number,
    (payload ->> 'receipts')::numeric(14, 2) as receipts,
    (payload ->> 'disbursements')::numeric(14, 2) as disbursements,
    (payload ->> 'last_cash_on_hand_end_period')::numeric(14, 2) as cash_on_hand,
    (payload ->> 'last_debts_owed_by_committee')::numeric(14, 2) as debts,
    (payload ->> 'individual_contributions')::numeric(14, 2) as individual_contributions,
    (payload ->> 'individual_itemized_contributions')::numeric(14, 2)
        as individual_itemized_contributions,
    (payload ->> 'individual_unitemized_contributions')::numeric(14, 2)
        as individual_unitemized_contributions,
    (payload ->> 'political_party_committee_contributions')::numeric(14, 2)
        as party_committee_contributions,
    (payload ->> 'other_political_committee_contributions')::numeric(14, 2)
        as other_committee_contributions,
    (payload ->> 'candidate_contribution')::numeric(14, 2) as candidate_contribution,
    (payload ->> 'loans_made_by_candidate')::numeric(14, 2) as loans_made_by_candidate,
    (payload ->> 'transfers_from_other_authorized_committee')::numeric(14, 2)
        as transfers_from_other_authorized_committee,
    (payload ->> 'other_receipts')::numeric(14, 2) as other_receipts,
    (payload ->> 'offsets_to_operating_expenditures')::numeric(14, 2)
        as offsets_to_operating_expenditures,
    (payload ->> 'contributions')::numeric(14, 2) as contributions,
    (payload ->> 'contribution_refunds')::numeric(14, 2) as contribution_refunds,
    (payload ->> 'operating_expenditures')::numeric(14, 2) as operating_expenditures,
    'fec' as source,
    source_url,
    fetched_at
from {{ source('raw', 'fec_committee_totals') }}
