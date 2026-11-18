-- One row per office listed for a state legislator or governor in openstates/people
-- (raw.state_person, ADR 0035). classification is capitol, district, capitol-mail, district-mail,
-- home or primary; `voice` is the phone number as the source writes it.
select
    p.person_id,
    o.ordinality::int as office_index,
    o.value ->> 'classification' as classification,
    nullif(btrim(o.value ->> 'address'), '') as address,
    nullif(btrim(o.value ->> 'voice'), '') as phone
from {{ source('raw', 'state_person') }} as p
cross join lateral jsonb_array_elements(coalesce(p.payload -> 'offices', '[]'::jsonb))
    with ordinality as o (value, ordinality)
