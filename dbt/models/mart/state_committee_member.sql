-- Committee seats of each seated state legislator (state_seat_holder, ADR 0035), from the committee
-- files of openstates/people. Only memberships the source links to a person are kept. Leaders
-- (any role other than plain "member") come first.
--
-- The committee files have no dates: they describe the committees as they are now. An archived
-- build (states_as_of set) would pair a past legislature with today's committees, so this model
-- is empty there.
select
    m.person_id,
    m.state,
    m.committee_id,
    m.committee_name,
    m.committee_chamber,
    case when lower(m.role) = 'member' then null else m.role end as role,
    row_number() over (
        partition by m.person_id
        order by (m.role is null or lower(m.role) = 'member'), m.committee_name, m.committee_id
    )::int as committee_order
from {{ ref('stg_state_committee_members') }} as m
inner join {{ ref('state_seat_holder') }} as h
    on h.person_id = m.person_id and h.is_seated and h.state = m.state
{% if var('states_as_of', none) %}
where false
{% endif %}
