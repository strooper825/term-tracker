-- One row per tracked member-term that overlaps the current Congress (v1 scope).
-- `congress` is the Congress in session when the term began (119 for a House term starting
-- 2025-01-03; 117 for a Senate term starting 2021-01-03 that runs through the 119th) and
-- `end_congress` the one in session on the day before the term ends, so the span is
-- congress..end_congress ([117, 118, 119] for that Senate term).
select
    t.bioguide_id,
    {{ congress_number('t.start_date') }} as congress,
    {{ congress_number('(t.end_date - 1)') }} as end_congress,
    t.chamber,
    t.start_date,
    t.end_date,
    t.state_abbr,
    f.fips_state,
    f.state_name,
    case when t.chamber = 'house' then t.district end as district,
    t.senate_class,
    t.party,
    t.caucus,
    t.state_rank,
    t.source,
    t.source_url,
    t.fetched_at
from {{ ref('stg_legislator_terms') }} as t
inner join {{ ref('tracked_members') }} as tm on tm.bioguide_id = t.bioguide_id
left join {{ ref('fips') }} as f on f.state_abbr = t.state_abbr
where t.end_date > '{{ var("current_congress_start") }}'::date
    and t.start_date < '{{ var("current_congress_end") }}'::date
