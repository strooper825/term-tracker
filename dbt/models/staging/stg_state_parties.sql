-- One row per (person, party) from openstates/people (ADR 0035), in the order the file lists
-- them: the last is the current party. Dates are present only when the party changed.
select
    p.person_id,
    e.ordinality::int as party_index,
    e.value ->> 'name' as party_label,
    {{ state_party_letter("e.value ->> 'name'") }} as party,
    (e.value ->> 'start_date')::date as start_date,
    (e.value ->> 'end_date')::date as end_date,
    e.ordinality = jsonb_array_length(p.payload -> 'party') as is_latest
from {{ source('raw', 'state_person') }} as p
cross join lateral jsonb_array_elements(coalesce(p.payload -> 'party', '[]'::jsonb))
    with ordinality as e (value, ordinality)
