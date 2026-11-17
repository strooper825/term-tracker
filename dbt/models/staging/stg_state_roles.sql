-- One row per legislative or governor role in openstates/people (ADR 0035). `chamber` is upper,
-- lower or legislature (Nebraska, the DC Council); a governor's role has chamber 'governor' and
-- no district. The state comes from the role's jurisdiction, not the folder.
--
-- Open States leaves start_date out on 850 of 10,267 legislative roles (2026-11-17). Such a role
-- counts as held since before any day the site shows; state_seat_holder drops it when it would
-- put more people in a district than it has seats.
select
    p.person_id,
    r.ordinality::int as role_index,
    r.value ->> 'type' as chamber,
    upper(substring(r.value ->> 'jurisdiction' from '(?:state|district|territory):([a-z]{2})')) as state,
    nullif(r.value ->> 'district', '') as district,
    (r.value ->> 'start_date')::date as start_date,
    (r.value ->> 'end_date')::date as end_date,
    nullif(r.value ->> 'end_reason', '') as end_reason
from {{ source('raw', 'state_person') }} as p
cross join lateral jsonb_array_elements(p.payload -> 'roles') with ordinality as r (value, ordinality)
where r.value ->> 'type' in ('upper', 'lower', 'legislature', 'governor')
