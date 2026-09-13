-- One row per legislator in raw.legislator with the identity fields the mart needs.
select
    bioguide_id,
    payload -> 'name' ->> 'first' as first_name,
    payload -> 'name' ->> 'last' as last_name,
    payload -> 'name' ->> 'official_full' as official_full_name,
    (payload -> 'id' ->> 'govtrack')::int as govtrack_id,
    (payload -> 'id' ->> 'icpsr')::int as icpsr_id,
    payload -> 'id' ->> 'lis' as lis_id,
    coalesce(payload -> 'id' -> 'fec', '[]'::jsonb) as fec_ids,
    'legislators' as source,
    source_url,
    fetched_at
from {{ source('raw', 'legislator') }}
