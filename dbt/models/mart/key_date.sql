-- Calendar events (plan section 4, key_date; panel 6): the hand-maintained key_dates seed
-- (sessions, the general election day) and the states' election calendars from the
-- election_dates seed (ADR 0023).
--
-- A state row is for everyone the state elects unless `office` (house / senate) or `districts`
-- narrows it: Louisiana held its 2026 Senate and House primaries on different days, and
-- Alabama moved four House districts' primary. The API shows a member only the rows that
-- apply to their chamber and district.
with election_dates as (
    select
        e.date,
        f.state_name
        || case e.office when 'house' then ' House' when 'senate' then ' Senate' else '' end
        || case e.event
            when 'filing_deadline' then ' candidate filing deadline'
            when 'primary' then ' primary'
            when 'primary_runoff' then ' primary runoff'
            when 'general_runoff' then ' general election runoff'
        end
        || case
            when e.districts is not null
                then ', districts ' || replace(e.districts, ' ', ', ')
            else ''
        end
        || case when e.qualifier is not null then ' (' || e.qualifier || ')' else '' end
            as label,
        case e.event when 'filing_deadline' then 'deadline' else 'election' end as kind,
        e.state,
        e.office,
        string_to_array(e.districts, ' ')::int[] as districts,
        e.rule,
        e.source_url,
        e.checked_on
    from {{ ref('election_dates') }} as e
    inner join {{ ref('fips') }} as f on f.state_abbr = e.state
    where e.cycle = {{ var('current_congress') }}::int * 2 + 1788
)

select
    date,
    label,
    kind,
    scope,
    scope_value,
    null::text as office,
    null::int[] as districts,
    note,
    'key_dates_seed' as source,
    source_url,
    '{{ var("key_dates_fetched_at") }}'::timestamptz as fetched_at
from {{ ref('key_dates') }}

union all

select
    date,
    label,
    kind,
    'state' as scope,
    state as scope_value,
    office,
    districts,
    rule as note,
    'election_dates_seed' as source,
    source_url,
    checked_on::timestamptz as fetched_at
from election_dates
