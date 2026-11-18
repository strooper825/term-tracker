-- One row per member of a state legislative committee in openstates/people
-- (raw.state_committee, ADR 0035). committee_chamber is upper, lower, or legislature for a
-- committee of the whole legislature (a joint committee where there are two chambers). role is
-- as the source writes it ("Chair", "vice chair", "member"). person_id is null where the source
-- did not link the name to a person (about a quarter of memberships on 2026-11-17).
select
    c.committee_id,
    c.state,
    c.payload ->> 'name' as committee_name,
    c.payload ->> 'chamber' as committee_chamber,
    m.ordinality::int as member_index,
    m.value ->> 'name' as member_name,
    nullif(btrim(m.value ->> 'role'), '') as role,
    nullif(m.value ->> 'person_id', '') as person_id,
    c.fetched_at
from {{ source('raw', 'state_committee') }} as c
cross join lateral jsonb_array_elements(coalesce(c.payload -> 'members', '[]'::jsonb))
    with ordinality as m (value, ordinality)
