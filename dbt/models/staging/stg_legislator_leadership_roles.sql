-- One row per (legislator, leadership role) unnested from raw.legislator
-- payload -> 'leadership_roles' (party and chamber leadership: Speaker, floor leaders, whips,
-- conference and caucus officers). end_date is null while the role is held.
select
    l.bioguide_id,
    r.ordinality as role_index,
    r.value ->> 'title' as title,
    r.value ->> 'chamber' as chamber,
    (r.value ->> 'start')::date as start_date,
    (r.value ->> 'end')::date as end_date,
    'legislators' as source,
    l.source_url,
    l.fetched_at
from {{ source('raw', 'legislator') }} as l
cross join lateral jsonb_array_elements(l.payload -> 'leadership_roles')
    with ordinality as r (value, ordinality)
