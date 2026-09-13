-- One row per committee linked to a tracked member's current-office candidate in a cycle
-- (raw.fec_committee). designation: P principal campaign committee, A other authorized,
-- J joint fundraising, D leadership PAC, U unauthorized.
select
    committee_id,
    cycle,
    candidate_id,
    payload ->> 'name' as name,
    payload ->> 'designation' as designation,
    payload ->> 'designation_full' as designation_full,
    payload ->> 'committee_type' as committee_type,
    payload ->> 'committee_type_full' as committee_type_full,
    payload ->> 'party' as party,
    payload ->> 'state' as state,
    payload ->> 'treasurer_name' as treasurer_name,
    payload ->> 'filing_frequency' as filing_frequency,
    (payload ->> 'first_file_date')::date as first_file_date,
    (payload ->> 'last_file_date')::date as last_file_date,
    coalesce(payload -> 'cycles', '[]'::jsonb) as cycles,
    'fec' as source,
    source_url,
    fetched_at
from {{ source('raw', 'fec_committee') }}
