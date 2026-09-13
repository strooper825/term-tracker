-- One row per (principal campaign committee, cycle) with the two-year totals and the receipt
-- breakdown the Fundraising panel shows. Every displayed figure, percentages included, is a
-- column here (plan section 7: the frontend computes nothing).
--
-- Receipt sources partition total receipts:
--   individual_small  individual contributions of $200 or less in aggregate (unitemized)
--   individual_large  individual contributions over $200 in aggregate (itemized)
--   pac               other political committees (PACs)
--   party             party committees
--   self_funding      the candidate's own contributions plus loans from the candidate
--   transfers         transfers from other authorized committees (joint fundraising etc.)
--   other             everything else: offsets to operating expenditures, other receipts,
--                     loans from anyone but the candidate (receipts minus the six above)
-- Refunds are disbursements and do not reduce any of these.
with totals as (
    select
        t.*,
        t.individual_unitemized_contributions as individual_small,
        t.individual_itemized_contributions as individual_large,
        t.individual_contributions as individual_total,
        t.other_committee_contributions as pac,
        t.party_committee_contributions as party,
        coalesce(t.candidate_contribution, 0) + coalesce(t.loans_made_by_candidate, 0)
            as self_funding,
        t.transfers_from_other_authorized_committee as transfers
    from {{ ref('stg_fec_committee_totals') }} as t
),

derived as (
    select
        t.*,
        t.receipts
        - coalesce(t.individual_total, 0)
        - coalesce(t.pac, 0)
        - coalesce(t.party, 0)
        - t.self_funding
        - coalesce(t.transfers, 0) as other
    from totals as t
)

select
    d.committee_id,
    d.cycle,
    c.bioguide_id,
    c.candidate_id,
    c.name as committee_name,
    d.coverage_start_date,
    d.coverage_end_date,
    d.last_report_type,
    d.last_report_year,
    d.last_beginning_image_number,
    d.receipts as raised,
    d.disbursements as spent,
    d.cash_on_hand,
    d.debts,
    d.individual_small,
    d.individual_large,
    d.individual_total,
    d.pac,
    d.party,
    d.self_funding,
    d.transfers,
    d.other,
    round(100.0 * d.individual_small / nullif(d.receipts, 0), 2) as small_donor_pct,
    round(100.0 * d.individual_small / nullif(d.individual_total, 0), 2)
        as small_donor_of_individual_pct,
    round(100.0 * d.individual_small / nullif(d.receipts, 0), 2) as individual_small_pct,
    round(100.0 * d.individual_large / nullif(d.receipts, 0), 2) as individual_large_pct,
    round(100.0 * d.individual_total / nullif(d.receipts, 0), 2) as individual_pct,
    round(100.0 * d.pac / nullif(d.receipts, 0), 2) as pac_pct,
    round(100.0 * d.party / nullif(d.receipts, 0), 2) as party_pct,
    round(100.0 * d.self_funding / nullif(d.receipts, 0), 2) as self_funding_pct,
    round(100.0 * d.transfers / nullif(d.receipts, 0), 2) as transfers_pct,
    round(100.0 * d.other / nullif(d.receipts, 0), 2) as other_pct,
    d.contributions,
    d.contribution_refunds,
    d.operating_expenditures,
    d.other_receipts,
    d.offsets_to_operating_expenditures,
    c.fec_url,
    d.source,
    d.source_url,
    d.fetched_at
from derived as d
inner join {{ ref('fec_committee') }} as c
    on c.committee_id = d.committee_id and c.cycle = d.cycle
where c.is_principal
