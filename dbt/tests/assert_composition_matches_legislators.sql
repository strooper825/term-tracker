{{ config(severity='warn') }}
-- Drift check for the hand-maintained composition seed (ADR 0012): the party counts of the
-- voting members in raw.legislator (congress-legislators, latest term of each current member)
-- against seed.composition_seats. Warns and never fails, so a swearing-in between manual
-- updates cannot stop the nightly build. Delegates and the Resident Commissioner are not among
-- the 435 and are left out. Vacant is the chamber size less the members listed.
with latest as (
    select
        case payload -> 'terms' -> -1 ->> 'type' when 'rep' then 'house' when 'sen' then 'senate' end
            as chamber,
        payload -> 'terms' -> -1 ->> 'party' as party,
        payload -> 'terms' -> -1 ->> 'state' as state
    from {{ source('raw', 'legislator') }}
),

voting as (
    select chamber, party
    from latest
    where state not in ('AS', 'DC', 'GU', 'MP', 'PR', 'VI')
),

listed as (
    select
        chamber,
        case party
            when 'Republican' then 'republican'
            when 'Democrat' then 'democratic'
            else 'independent'
        end as party_group,
        count(*) as seats
    from voting
    group by 1, 2
),

sizes (chamber, seats) as (values ('house', 435), ('senate', 100)),

expected as (
    select chamber, party_group, seats from listed
    union all
    select s.chamber, 'vacant', s.seats - coalesce(sum(l.seats), 0)
    from sizes as s
    left join listed as l on l.chamber = s.chamber
    group by s.chamber, s.seats
)

select
    coalesce(e.chamber, c.chamber) as chamber,
    coalesce(e.party_group, c.party_group) as party_group,
    e.seats as congress_legislators_seats,
    c.seats as seeded_seats
from expected as e
full join {{ ref('composition_seats') }} as c
    on c.chamber = e.chamber and c.party_group = e.party_group
where coalesce(e.seats, 0) <> coalesce(c.seats, 0)
