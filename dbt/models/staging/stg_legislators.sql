-- One row per legislator in raw.legislator with the identity and biography fields the mart
-- needs. External ids beyond these stay in the payload (see docs/data-dictionary.md).
select
    bioguide_id,
    payload -> 'name' ->> 'first' as first_name,
    payload -> 'name' ->> 'middle' as middle_name,
    payload -> 'name' ->> 'last' as last_name,
    payload -> 'name' ->> 'nickname' as nickname,
    payload -> 'name' ->> 'suffix' as suffix,
    payload -> 'name' ->> 'official_full' as official_full_name,
    (payload -> 'bio' ->> 'birthday')::date as birthday,
    payload -> 'bio' ->> 'gender' as gender,
    (payload -> 'id' ->> 'govtrack')::int as govtrack_id,
    (payload -> 'id' ->> 'icpsr')::int as icpsr_id,
    payload -> 'id' ->> 'lis' as lis_id,
    coalesce(payload -> 'id' -> 'fec', '[]'::jsonb) as fec_ids,
    payload -> 'id' ->> 'opensecrets' as opensecrets_id,
    payload -> 'id' ->> 'wikipedia' as wikipedia_id,
    payload -> 'id' ->> 'ballotpedia' as ballotpedia_id,
    (payload -> 'id' ->> 'cspan')::int as cspan_id,
    (payload -> 'id' ->> 'votesmart')::int as votesmart_id,
    payload -> 'id' ->> 'wikidata' as wikidata_id,
    'legislators' as source,
    source_url,
    fetched_at
from {{ source('raw', 'legislator') }}
