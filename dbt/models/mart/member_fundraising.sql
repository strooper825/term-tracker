-- One row per tracked member and cycle (the current cycle only in v1), whatever the FEC has:
-- `status` says how far the chain member -> candidate -> principal committee -> totals got,
-- so the panel can say what is missing instead of showing zeros.
--   no_candidate   none of the member's FEC candidate ids is for the current office
--   no_committee   the candidate has no principal campaign committee in the cycle
--   no_filings     the committee has filed nothing covering the cycle yet
--   filed          totals present; every figure below is populated
-- The current-office candidate is the id whose `office` letter matches the chamber of the
-- member's latest term (H for the House, S for the Senate); see ADR 0006.
with latest_term as (
    select distinct on (bioguide_id) bioguide_id, chamber
    from {{ ref('term') }}
    order by bioguide_id, start_date desc
),

candidate as (
    select
        cand.bioguide_id,
        cand.candidate_id,
        cand.name as candidate_name,
        cand.office,
        cand.source_url as candidate_source_url,
        cand.fetched_at as candidate_fetched_at
    from {{ ref('stg_fec_candidates') }} as cand
    inner join latest_term as t on t.bioguide_id = cand.bioguide_id
    where cand.office = case t.chamber when 'house' then 'H' else 'S' end
),

cycle as (
    select {{ var('current_congress') }}::int * 2 + 1788 as cycle
),

principal as (
    select c.bioguide_id, c.cycle, c.committee_id, c.name, c.fec_url, c.source_url, c.fetched_at
    from {{ ref('fec_committee') }} as c
    where c.is_principal
)

select
    m.bioguide_id,
    cy.cycle,
    case
        when s.committee_id is not null then 'filed'
        when p.committee_id is not null then 'no_filings'
        when cand.candidate_id is not null then 'no_committee'
        else 'no_candidate'
    end as status,
    cand.candidate_id,
    cand.candidate_name,
    case
        when cand.candidate_id is not null
            then 'https://www.fec.gov/data/candidate/' || cand.candidate_id
                || '/?cycle=' || cy.cycle::text || '&election_full=false'
    end as candidate_fec_url,
    p.committee_id,
    p.name as committee_name,
    p.fec_url as committee_fec_url,
    s.coverage_start_date,
    s.coverage_end_date,
    s.last_report_type,
    s.last_report_year,
    s.raised,
    s.spent,
    s.cash_on_hand,
    s.debts,
    s.individual_small,
    s.individual_large,
    s.individual_total,
    s.pac,
    s.party,
    s.self_funding,
    s.transfers,
    s.other,
    s.small_donor_pct,
    s.small_donor_of_individual_pct,
    s.individual_small_pct,
    s.individual_large_pct,
    s.individual_pct,
    s.pac_pct,
    s.party_pct,
    s.self_funding_pct,
    s.transfers_pct,
    s.other_pct,
    'fec' as source,
    coalesce(s.source_url, p.source_url, cand.candidate_source_url, 'https://api.open.fec.gov/v1')
        as source_url,
    coalesce(s.fetched_at, p.fetched_at, cand.candidate_fetched_at, m.fetched_at) as fetched_at
from {{ ref('member') }} as m
cross join cycle as cy
left join candidate as cand on cand.bioguide_id = m.bioguide_id
left join principal as p on p.bioguide_id = m.bioguide_id and p.cycle = cy.cycle
left join {{ ref('fec_summary') }} as s
    on s.committee_id = p.committee_id and s.cycle = p.cycle
