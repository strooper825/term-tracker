-- One row per (legislator, term) unnested from raw.legislator payload -> 'terms'.
select
    l.bioguide_id,
    t.ordinality as term_index,
    case t.value ->> 'type' when 'rep' then 'house' when 'sen' then 'senate' end as chamber,
    (t.value ->> 'start')::date as start_date,
    (t.value ->> 'end')::date as end_date,
    t.value ->> 'state' as state_abbr,
    (t.value ->> 'district')::int as district,
    (t.value ->> 'class')::int as senate_class,
    t.value ->> 'party' as party,
    t.value ->> 'state_rank' as state_rank,
    'legislators' as source,
    l.source_url,
    l.fetched_at
from {{ source('raw', 'legislator') }} as l
cross join lateral jsonb_array_elements(l.payload -> 'terms') with ordinality as t (value, ordinality)
