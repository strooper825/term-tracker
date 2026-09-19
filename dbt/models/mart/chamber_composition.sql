-- The party split of the 435 House and 100 Senate seats, one row per chamber and party group
-- with seats (ADR 0012). The seed is hand-maintained: no ingested source lists vacancies.
-- seat_pct is the group's share of the chamber's seats, which is what the page draws the
-- stacked bar's segment width from. A group with no seats (no Senate vacancies) has no row.
with seeded as (
    select
        chamber,
        party_group,
        seats,
        caucus_with,
        sum(seats) over (partition by chamber) as chamber_seats
    from {{ ref('composition_seats') }}
)

select
    chamber,
    party_group,
    case party_group
        when 'republican' then 'Republican'
        when 'democratic' then 'Democratic'
        when 'independent' then 'Independent'
        when 'vacant' then 'Vacant'
    end as party_label,
    seats,
    chamber_seats,
    round(100.0 * seats / chamber_seats, 2) as seat_pct,
    caucus_with,
    case party_group
        when 'republican' then 1
        when 'democratic' then 2
        when 'independent' then 3
        when 'vacant' then 4
    end as sort_order,
    'clerk_house_senate_gov' as source,
    case chamber
        when 'house' then '{{ var("composition_house_source_url") }}'
        else '{{ var("composition_senate_source_url") }}'
    end as source_url,
    '{{ var("composition_as_of") }}'::date::timestamptz as fetched_at,
    '{{ var("composition_as_of") }}'::date as as_of
from seeded
where seats > 0
