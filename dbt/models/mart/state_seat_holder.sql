-- Who held each state legislative seat on the States section's day (ADR 0035, macro
-- states_as_of): one row per person in a legislative role that day, with the party they held
-- that day reduced to the federal parties (macro state_party_letter), and their district's shape
-- and seat count from seeds/state_districts.csv.
--
-- A role without a start date counts as held since before the day. When that puts more people in
-- a district than it has seats (a newcomer's role open, a predecessor's not yet closed), the
-- people with the latest known start dates are seated and the rest have is_seated false;
-- assert_state_seats_not_overfilled lists them.
with as_of as (
    select {{ states_as_of() }} as day
),

active as (
    select distinct on (r.person_id)
        r.person_id,
        r.state,
        r.chamber,
        r.district,
        r.start_date,
        r.end_date
    from {{ ref('stg_state_roles') }} as r
    cross join as_of
    where r.chamber <> 'governor'
        and coalesce(r.start_date, '0001-01-01'::date) <= as_of.day
        and (r.end_date is null or r.end_date >= as_of.day)
    order by r.person_id, r.start_date desc nulls last, r.role_index desc
),

party as (
    select distinct on (pa.person_id)
        pa.person_id,
        pa.party_label,
        pa.party
    from {{ ref('stg_state_parties') }} as pa
    cross join as_of
    where (pa.start_date is null or pa.start_date <= as_of.day)
        and (pa.end_date is null or pa.end_date >= as_of.day)
    order by pa.person_id, pa.party_index desc
),

placed as (
    select
        a.state,
        a.chamber,
        a.district,
        d.seats as district_seats,
        nullif(d.shape, '') as shape,
        nullif(d.note, '') as district_note,
        a.person_id,
        p.name,
        p.given_name,
        p.family_name,
        p.image_url,
        p.email,
        p.website_url,
        pa.party_label,
        -- Nonpartisan is Nebraska's legislature; anyone else so labelled is an independent.
        case
            when pa.party = 'N' and a.state <> 'NE' then 'I'
            else coalesce(pa.party, 'I')
        end as party,
        a.start_date,
        a.end_date,
        row_number() over (
            partition by a.state, a.chamber, a.district
            order by a.start_date desc nulls last, a.person_id
        ) as seat_rank,
        p.source_url,
        p.fetched_at
    from active as a
    inner join {{ ref('stg_state_people') }} as p on p.person_id = a.person_id
    left join party as pa on pa.person_id = a.person_id
    left join {{ ref('state_districts') }} as d
        on d.state = a.state and d.chamber = a.chamber and d.district = a.district
)

select
    placed.state,
    placed.chamber,
    placed.district,
    placed.district_seats,
    placed.shape,
    placed.district_note,
    placed.person_id,
    placed.name,
    placed.given_name,
    placed.family_name,
    placed.image_url,
    placed.email,
    placed.website_url,
    placed.party_label,
    placed.party,
    -- The party as a group that can control a chamber: R, D or N, or for anyone else the party
    -- itself ("Partido Nuevo Progresista"), so Puerto Rico's parties are not lumped together.
    -- Independents form one group.
    case
        when placed.party in ('R', 'D', 'N') then placed.party
        when placed.party_label is null
            or placed.party_label ilike 'independent%'
            or placed.party_label ilike 'nonpartisan'
            then 'Independent'
        else split_part(placed.party_label, '/', 1)
    end as party_group,
    placed.start_date,
    placed.end_date,
    placed.seat_rank <= coalesce(placed.district_seats, 1) as is_seated,
    coalesce(placed.district_note, '') = 'non-voting' as is_non_voting,
    as_of.day as as_of,
    placed.source_url,
    placed.fetched_at
from placed
cross join as_of
