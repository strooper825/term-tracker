-- One row per session of a Congress, with the dates that bound it. The activity feed's date
-- filter offers "this session" as a preset and takes the boundary from here rather than
-- computing one in the browser.
--
-- A session runs from January 3 (the 20th Amendment's convening date) to the day before the
-- next session convenes; the last session of a Congress runs to the end of the Congress. The
-- year comes from the session's own roll calls, so a session with no recorded vote yet does
-- not appear at all.
with sessions as (
    select
        congress,
        session,
        count(*) as roll_calls,
        min(vote_date) as first_roll_call_date,
        max(vote_date) as last_roll_call_date,
        extract(year from min(vote_date))::int as session_year,
        max(fetched_at) as fetched_at
    from {{ ref('roll_call') }}
    group by 1, 2
)

select
    s.congress,
    s.session,
    s.session_year,
    make_date(s.session_year, 1, 3) as start_date,
    -- through the day before the next session convenes, or the end of the Congress
    coalesce(
        lead(make_date(s.session_year, 1, 3)) over (partition by s.congress order by s.session)
            - 1,
        '{{ var("current_congress_end") }}'::date
    ) as end_date,
    s.first_roll_call_date,
    s.last_roll_call_date,
    s.roll_calls,
    s.session = max(s.session) over (partition by s.congress) as is_current,
    'congress_gov' as source,
    'https://www.congress.gov/days-in-session' as source_url,
    s.fetched_at
from sessions as s
