-- Hub table: one row per state (district null; Senate seats and statewide data attach here)
-- plus one row per House district in the current Congress. See docs/adr/0001-constituency-key.md.
with fips as (
    select fips_state, state_abbr, state_name from {{ ref('fips') }}
),

states as (
    select
        fips_state,
        null::int as district,
        state_abbr,
        state_name,
        state_name as label,
        'census_fips' as source,
        '{{ var("fips_source_url") }}' as source_url,
        '{{ var("fips_fetched_at") }}'::timestamptz as fetched_at
    from fips
),

districts as (
    select
        f.fips_state,
        t.district,
        t.state_abbr,
        f.state_name,
        case
            when t.district = 0 then t.state_abbr || ' (At Large)'
            else t.state_abbr || '-' || t.district::text
        end as label,
        'legislators' as source,
        max(t.source_url) as source_url,
        max(t.fetched_at) as fetched_at
    from {{ ref('stg_legislator_terms') }} as t
    inner join fips as f on f.state_abbr = t.state_abbr
    where t.chamber = 'house'
        and t.district is not null
        and t.end_date > '{{ var("current_congress_start") }}'::date
    group by 1, 2, 3, 4, 5, 6
)

select * from states
union all
select * from districts
