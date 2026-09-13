-- One row per FEC committee linked to a tracked member's current-office candidate in a cycle:
-- the principal campaign committee (is_principal) plus any leadership PAC, joint fundraising
-- or other authorized committee, kept so the panel can say what is excluded. Only the
-- principal committee is ever summed (ADR 0006).
select
    c.committee_id,
    c.cycle,
    cand.bioguide_id,
    c.candidate_id,
    c.name,
    c.designation,
    c.designation_full,
    c.committee_type,
    c.committee_type_full,
    c.designation = 'P' as is_principal,
    c.party,
    c.state,
    c.treasurer_name,
    c.filing_frequency,
    c.first_file_date,
    c.last_file_date,
    c.cycles,
    'https://www.fec.gov/data/committee/' || c.committee_id || '/?cycle=' || c.cycle::text
        as fec_url,
    c.source,
    c.source_url,
    c.fetched_at
from {{ ref('stg_fec_committees') }} as c
inner join {{ ref('stg_fec_candidates') }} as cand on cand.candidate_id = c.candidate_id
inner join {{ ref('tracked_members') }} as tm on tm.bioguide_id = cand.bioguide_id
