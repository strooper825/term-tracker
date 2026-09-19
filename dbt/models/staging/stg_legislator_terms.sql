-- One row per (legislator, term) unnested from raw.legislator payload -> 'terms'.
-- caucus is set for Independents who caucus with a party; party_affiliations lists the
-- party history within a term when it changed mid-term (the term-level party is the latest).
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
    t.value ->> 'caucus' as caucus,
    t.value -> 'party_affiliations' as party_affiliations,
    t.value ->> 'state_rank' as state_rank,
    t.value ->> 'how' as how,
    t.value ->> 'end-type' as end_type,
    -- the office contact block; the source leaves a key out rather than writing null
    nullif(t.value ->> 'url', '') as website_url,
    nullif(t.value ->> 'phone', '') as phone,
    nullif(t.value ->> 'fax', '') as fax,
    nullif(t.value ->> 'office', '') as office,
    nullif(t.value ->> 'address', '') as address,
    nullif(t.value ->> 'contact_form', '') as contact_form_url,
    nullif(t.value ->> 'rss_url', '') as rss_url,
    'legislators' as source,
    l.source_url,
    l.fetched_at
from {{ source('raw', 'legislator') }} as l
cross join lateral jsonb_array_elements(l.payload -> 'terms') with ordinality as t (value, ordinality)
