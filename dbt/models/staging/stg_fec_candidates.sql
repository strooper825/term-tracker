-- One row per FEC candidate id of a tracked member (raw.fec_candidate). `office` is H, S, or P
-- and is also the first letter of the id; the mart picks the id whose office matches the
-- chamber of the member's latest term (docs/adr/0006-fec-principal-committee-scope.md).
select
    candidate_id,
    bioguide_id,
    payload ->> 'name' as name,
    payload ->> 'office' as office,
    payload ->> 'state' as state,
    payload ->> 'district' as district,
    payload ->> 'party' as party,
    payload ->> 'candidate_status' as candidate_status,
    (payload ->> 'active_through')::int as active_through,
    coalesce(payload -> 'cycles', '[]'::jsonb) as cycles,
    coalesce(payload -> 'election_years', '[]'::jsonb) as election_years,
    (payload ->> 'first_file_date')::date as first_file_date,
    (payload ->> 'last_file_date')::date as last_file_date,
    'fec' as source,
    source_url,
    fetched_at
from {{ source('raw', 'fec_candidate') }}
