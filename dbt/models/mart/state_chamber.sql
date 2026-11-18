-- Each state legislative chamber on the States section's day (ADR 0035): its seats, how many each
-- party holds, and who controls it. Vacant seats count in the total, so a majority is more than
-- half of all seats, not of the filled ones; non-voting members (Maine's tribal representatives)
-- count in neither.
--
-- Control goes to a party group (state_chamber_party: R, D, N, or one other party by name), never
-- to "others" taken together. control_kind: supermajority (the group holds at least the seats
-- seeds/state_supermajority.csv asks), majority, coalition (seeds/state_control_overrides.csv:
-- the chamber is run by a cross-party coalition, whatever the seat counts), nonpartisan
-- (Nebraska), or none (no group holds a majority).
with as_of as (
    select {{ states_as_of() }} as day
),

counts as (
    select
        state,
        chamber,
        sum(seats) filter (where party = 'R') as republican,
        sum(seats) filter (where party = 'D') as democratic,
        sum(seats) filter (where party = 'I') as other,
        sum(seats) filter (where party = 'N') as nonpartisan,
        sum(seats) as filled,
        bool_or(by_registration) as by_registration
    from {{ ref('state_chamber_party') }}
    group by state, chamber
),

-- The largest party group; independents are not a party and cannot control a chamber.
leader as (
    select distinct on (state, chamber)
        state,
        chamber,
        party_group as leading_group,
        party as leading_party,
        seats as leading_seats
    from {{ ref('state_chamber_party') }}
    where party_group <> 'Independent'
    order by state, chamber, seats desc, party_group
),

overrides as (
    select o.*
    from {{ ref('state_control_overrides') }} as o
    cross join as_of
    where o.from_date <= as_of.day and (o.to_date is null or o.to_date >= as_of.day)
),

sized as (
    select
        c.state,
        c.chamber,
        c.chamber_name,
        c.legislature_name,
        c.title,
        c.seats,
        coalesce(n.republican, 0)::int as republican,
        coalesce(n.democratic, 0)::int as democratic,
        coalesce(n.other, 0)::int as other,
        coalesce(n.nonpartisan, 0)::int as nonpartisan,
        coalesce(n.filled, 0)::int as filled,
        coalesce(n.by_registration, false) as by_registration,
        c.seats / 2 + 1 as majority_seats,
        ceil(c.seats::numeric * s.numerator / s.denominator)::int as supermajority_seats,
        s.numerator as supermajority_numerator,
        s.denominator as supermajority_denominator,
        s.basis as supermajority_basis,
        l.leading_group,
        l.leading_party,
        coalesce(l.leading_seats, 0) as leading_seats,
        o.control as override_control,
        o.note as override_note
    from {{ ref('state_chambers') }} as c
    left join counts as n on n.state = c.state and n.chamber = c.chamber
    left join leader as l on l.state = c.state and l.chamber = c.chamber
    left join {{ ref('state_supermajority') }} as s on s.state = c.state
    left join overrides as o on o.state = c.state and o.chamber = c.chamber
)

select
    state,
    chamber,
    chamber_name,
    legislature_name,
    title,
    seats,
    republican,
    democratic,
    other,
    nonpartisan,
    filled,
    seats - filled as vacant,
    by_registration,
    majority_seats,
    supermajority_seats,
    supermajority_numerator,
    supermajority_denominator,
    supermajority_basis,
    case when override_control is null and leading_seats >= majority_seats then leading_party end
        as control_party,
    case when override_control is null and leading_seats >= majority_seats then leading_group end
        as control_group,
    case
        when override_control is not null then override_control
        when leading_party = 'N' and leading_seats >= majority_seats then 'nonpartisan'
        when leading_seats >= supermajority_seats then 'supermajority'
        when leading_seats >= majority_seats then 'majority'
        else 'none'
    end as control_kind,
    override_note as control_note,
    case chamber when 'lower' then 2 else 1 end as chamber_order,
    -- the chamber's roster page: /states/{state}/{chamber_slug}
    case
        when chamber = 'upper' then 'senate'
        when chamber = 'legislature' and state = 'DC' then 'council'
        when chamber = 'legislature' then 'legislature'
        else lower(replace(chamber_name, ' ', '-'))
    end as chamber_slug,
    (select day from as_of) as as_of
from sized
