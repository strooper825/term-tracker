-- One row per chamber: seats, seated and vacant, the majority threshold, and who leads (ADR 0012).
-- Independents count with the party they caucus with, the same rule ADR 0005 uses for party
-- unity. The threshold is the constitutional count, chamber seats / 2 + 1 (218 of 435, 51 of
-- 100), and does not move while seats are vacant.
with seated as (
    select
        chamber,
        sum(seats) as chamber_seats,
        sum(seats) filter (where party_group <> 'vacant') as seated,
        sum(seats) filter (where party_group = 'vacant') as vacant,
        sum(seats) filter (
            where party_group = 'republican'
                or (party_group = 'independent' and caucus_with = 'republican')
        ) as republican_caucus,
        sum(seats) filter (
            where party_group = 'democratic'
                or (party_group = 'independent' and caucus_with = 'democratic')
        ) as democratic_caucus,
        max(source_url) as source_url,
        max(fetched_at) as fetched_at,
        max(as_of) as as_of
    from {{ ref('chamber_composition') }}
    group by chamber
)

select
    chamber,
    chamber_seats,
    seated,
    coalesce(vacant, 0) as vacant,
    -- the whole Congress, repeated on both rows so the page reads "533 of 535 seated" from a column
    sum(chamber_seats) over () as congress_seats,
    sum(seated) over () as congress_seated,
    sum(coalesce(vacant, 0)) over () as congress_vacant,
    chamber_seats / 2 + 1 as majority_threshold,
    -- where the majority line falls along the bar, as a share of the chamber's seats
    round(100.0 * (chamber_seats / 2 + 1) / chamber_seats, 2) as majority_pct,
    coalesce(republican_caucus, 0) as republican_caucus,
    coalesce(democratic_caucus, 0) as democratic_caucus,
    case
        when republican_caucus > democratic_caucus then 'republican'
        when democratic_caucus > republican_caucus then 'democratic'
    end as majority_party,
    case
        when republican_caucus > democratic_caucus then 'R'
        when democratic_caucus > republican_caucus then 'D'
    end as majority_letter,
    abs(coalesce(republican_caucus, 0) - coalesce(democratic_caucus, 0)) as majority_margin,
    'clerk_house_senate_gov' as source,
    source_url,
    fetched_at,
    as_of
from seated
