-- One row per (committee or subcommittee, member) unnested from raw.committee_membership.
select
    c.committee_id,
    m.value ->> 'bioguide' as bioguide_id,
    m.value ->> 'name' as member_name,
    m.value ->> 'party' as party,
    (m.value ->> 'rank')::int as rank,
    m.value ->> 'title' as title,
    'legislators' as source,
    c.source_url,
    c.fetched_at
from {{ source('raw', 'committee_membership') }} as c
cross join lateral jsonb_array_elements(c.payload) as m (value)
