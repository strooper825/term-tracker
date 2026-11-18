-- The legislative service on record for each seated state legislator (state_seat_holder,
-- ADR 0035): one row per unbroken span in one chamber and district, newest first. Open States
-- often splits a seat into one role per term; roles in the same chamber and district that follow
-- within a week of each other are one span. Roles that begin after the States section's day are
-- left out. Open States' records of earlier service are incomplete: many members have only their
-- current role, so this is service on record, not a full career.
--
-- Some records contradict themselves (2026-11-18: 223 of 7,417 people, most in Montana and Maine,
-- after redistricting): two spans that overlap by more than 30 days, which no one can serve.
-- For those people only the current seat is listed, from the role state_seat_holder found.
with as_of as (
    select {{ states_as_of() }} as day
),

roles as (
    select
        r.person_id,
        r.state,
        r.chamber,
        r.district,
        r.start_date,
        -- a role still open on the day ends after it
        case when r.end_date is null or r.end_date > as_of.day then null else r.end_date end
            as end_date,
        r.role_index
    from {{ ref('stg_state_roles') }} as r
    cross join as_of
    inner join {{ ref('state_seat_holder') }} as h
        on h.person_id = r.person_id and h.is_seated
    where r.chamber <> 'governor'
        and r.state = h.state
        and coalesce(r.start_date, '0001-01-01'::date) <= as_of.day
),

marked as (
    select
        *,
        case
            when lag(chamber) over w = chamber
                and lag(district) over w is not distinct from district
                and start_date is not null
                and lag(end_date) over w is not null
                and start_date <= lag(end_date) over w + 7
                then 0
            else 1
        end as starts_span
    from roles
    window w as (partition by person_id order by start_date nulls first, role_index)
),

spans as (
    select
        *,
        sum(starts_span) over (
            partition by person_id order by start_date nulls first, role_index
        ) as span
    from marked
),

merged as (
    select
        s.person_id,
        s.state,
        s.chamber,
        c.chamber_name,
        s.district,
        min(s.start_date) as start_date,
        -- null while the span is still running on the day
        case when bool_or(s.end_date is null) then null else max(s.end_date) end as end_date,
        bool_or(s.start_date is null) as start_unknown
    from spans as s
    left join {{ ref('state_chambers') }} as c on c.state = s.state and c.chamber = s.chamber
    group by s.person_id, s.state, s.chamber, c.chamber_name, s.district, s.span
),

conflicted as (
    select distinct a.person_id
    from merged as a
    inner join merged as b
        on a.person_id = b.person_id
        and (a.chamber, a.district, a.start_date) is distinct from (b.chamber, b.district, b.start_date)
        and a.start_date < coalesce(b.end_date, 'infinity'::date) - 30
        and b.start_date < coalesce(a.end_date, 'infinity'::date) - 30
),

listed as (
    select m.*
    from merged as m
    where m.person_id not in (select person_id from conflicted)
    union all
    select
        h.person_id,
        h.state,
        h.chamber,
        c.chamber_name,
        h.district,
        h.start_date,
        null::date as end_date,
        h.start_date is null as start_unknown
    from {{ ref('state_seat_holder') }} as h
    inner join conflicted as x on x.person_id = h.person_id
    left join {{ ref('state_chambers') }} as c on c.state = h.state and c.chamber = h.chamber
    where h.is_seated
)

select
    listed.*,
    listed.person_id in (select person_id from conflicted) as history_trimmed,
    row_number() over (
        partition by listed.person_id order by listed.start_date desc nulls last
    )::int as term_order
from listed
