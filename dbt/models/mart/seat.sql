-- One row per seat in Congress that someone holds today: all 435 House seats, the six
-- non-voting delegates, and the 100 Senate seats, for the homepage map and member search
-- (ADR 0022). Unlike `term`, this is NOT limited to tracked members; `is_tracked` says which
-- seats link to a dashboard.
--
-- Who holds a seat comes from the latest congress-legislators snapshot. raw.legislator keeps
-- a row for every legislator it has ever seen, so a member who left office is still there with
-- an older fetched_at; only rows from the newest load count. legislators-current.yaml lists
-- only people serving now, so each one's latest term that has begun is their seat. The term's
-- end date is not used: an appointed senator's term "ends" on the special election date and
-- they serve on until the winner is sworn in (Florida and Ohio after 2026-11-03). A seat no row
-- holds (a vacancy) has no row here, and the site draws it as vacant.
--
-- "Today" is clamped into the current Congress so an archive build, or a test run on fixtures
-- after the Congress has ended, still describes the Congress the mart is about.
with latest as (
    select max(fetched_at) as fetched_at from {{ source('raw', 'legislator') }}
),

as_of as (
    select
        greatest(
            {{ congress_start_date() }},
            least(current_date, {{ congress_end_date() }} - 1)
        ) as day
),

current_terms as (
    select distinct on (t.bioguide_id) t.*
    from {{ ref('stg_legislator_terms') }} as t
    inner join latest on t.fetched_at = latest.fetched_at
    cross join as_of
    where t.start_date <= as_of.day
    order by t.bioguide_id, t.start_date desc
)

select
    case
        when t.chamber = 'house' then 'house-' || t.state_abbr || '-' || t.district
        else 'senate-' || t.state_abbr || '-' || t.senate_class
    end as seat_key,
    t.chamber,
    t.state_abbr,
    f.state_name,
    f.fips_state,
    case when t.chamber = 'house' then t.district end as district,
    t.senate_class,
    t.state_rank,
    t.bioguide_id,
    coalesce(l.official_full_name, l.first_name || ' ' || l.last_name) as official_full_name,
    l.last_name,
    t.party,
    t.caucus,
    t.website_url,
    tm.bioguide_id is not null as is_tracked,
    'https://www.congress.gov/img/member/' || lower(t.bioguide_id) || '_200.jpg' as photo_url,
    t.source,
    t.source_url,
    t.fetched_at
from current_terms as t
inner join {{ ref('stg_legislators') }} as l on l.bioguide_id = t.bioguide_id
left join {{ ref('fips') }} as f on f.state_abbr = t.state_abbr
left join {{ ref('tracked_members') }} as tm on tm.bioguide_id = t.bioguide_id
