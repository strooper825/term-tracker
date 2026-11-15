-- One row per bill and amendment of the Congress that raw holds, whether or not it has a page:
-- the list the /bills browse page filters (ADR 0025). mart.bill is the detail pages, limited to
-- the tracked members' bills; this is everything, kept narrow.
--
-- stage is how far a measure got, read from the Library of Congress action codes on its own
-- action list, so it does not need a roll call (most measures pass by voice vote or unanimous
-- consent):
--   1 introduced
--   2 reported by a committee          5000 (House), 14000 (Senate)
--   3 passed one chamber               8000 (House), 17000 (Senate)
--   4 passed both, or presented        both of the above, or 28000 / E20000
--   5 became law                       36000 / E40000, or an action typed BecameLaw
-- has_floor_vote is a recorded roll call on the measure in either chamber (mart.roll_call).
--
-- is_minor marks what the browse page hides until asked: amendments, simple and concurrent
-- resolutions (they do not make law), and bills that name a post office.
with bills as (
    select
        congress,
        bill_type,
        bill_number,
        kind,
        payload,
        source_url,
        fetched_at
    from {{ source('raw', 'bill') }}
    where congress = {{ var('current_congress') }}
),

stages as (
    select
        a.congress,
        a.bill_type,
        a.bill_number,
        bool_or(x.value ->> 'actionCode' in ('5000', '14000')) as reported,
        bool_or(x.value ->> 'actionCode' = '8000') as passed_house,
        bool_or(x.value ->> 'actionCode' = '17000') as passed_senate,
        bool_or(x.value ->> 'actionCode' in ('28000', 'E20000')) as presented,
        bool_or(
            x.value ->> 'actionCode' in ('36000', 'E40000') or x.value ->> 'type' = 'BecameLaw'
        ) as became_law
    from {{ source('raw', 'bill_actions') }} as a
    cross join lateral jsonb_array_elements(a.payload) as x
    where a.congress = {{ var('current_congress') }}
    group by 1, 2, 3
),

cosponsors as (
    select
        congress,
        bill_type,
        bill_number,
        count(*) as cosponsor_count,
        count(*) filter (where party = 'D') as cosponsors_democratic,
        count(*) filter (where party = 'R') as cosponsors_republican
    from {{ ref('stg_bill_cosponsors') }}
    where withdrawn_date is null
    group by 1, 2, 3
),

votes as (
    select distinct congress, bill_type, bill_number
    from {{ ref('roll_call') }}
    where bill_type is not null and bill_number is not null
),

titled as (
    select
        b.*,
        case
            when b.kind = 'bill' then b.payload ->> 'title'
            else coalesce(
                b.payload ->> 'description',
                b.payload ->> 'purpose',
                'Amendment ' || b.bill_number || ' to '
                || (b.payload -> 'amendedBill' ->> 'type') || ' '
                || (b.payload -> 'amendedBill' ->> 'number')
            )
        end as title
    from bills as b
)

select
    b.congress,
    b.bill_type,
    b.bill_number,
    b.kind,
    {{ bill_label('b.bill_type', 'b.bill_number') }} as label,
    coalesce(b.title, {{ bill_label('b.bill_type', 'b.bill_number') }}) as title,
    b.payload -> 'policyArea' ->> 'name' as policy_area,
    case
        when left(b.bill_type, 1) = 'h' then 'House'
        else 'Senate'
    end as origin_chamber,
    case
        when b.kind = 'bill' then (b.payload ->> 'introducedDate')::date
        else (b.payload ->> 'submittedDate')::timestamptz::date
    end as introduced_date,
    (b.payload -> 'latestAction' ->> 'actionDate')::date as latest_action_date,
    b.payload -> 'latestAction' ->> 'text' as latest_action_text,
    nullif(
        concat_ws(
            ' ',
            b.payload -> 'sponsors' -> 0 ->> 'firstName',
            b.payload -> 'sponsors' -> 0 ->> 'lastName'
        ),
        ''
    ) as sponsor_name,
    b.payload -> 'sponsors' -> 0 ->> 'party' as sponsor_party,
    b.payload -> 'sponsors' -> 0 ->> 'state' as sponsor_state,
    coalesce(c.cosponsor_count, 0) as cosponsor_count,
    coalesce(c.cosponsors_democratic, 0) as cosponsors_democratic,
    coalesce(c.cosponsors_republican, 0) as cosponsors_republican,
    case
        when s.became_law then 5
        when s.presented or (s.passed_house and s.passed_senate) then 4
        when s.passed_house or s.passed_senate then 3
        when s.reported then 2
        else 1
    end as stage,
    v.bill_number is not null as has_floor_vote,
    (
        b.kind <> 'bill'
        or b.bill_type in ('hres', 'sres', 'hconres', 'sconres')
        or coalesce(b.title, '') ilike 'To designate the facility of the United States Postal Service%'
    ) as is_minor,
    scope.bill_number is not null as has_page,
    {{ congress_gov_url('b.kind', 'b.congress', 'b.bill_type', 'b.bill_number') }} as congress_gov_url,
    'congress_gov' as source,
    b.source_url,
    b.fetched_at
from titled as b
left join stages as s
    on s.congress = b.congress and s.bill_type = b.bill_type and s.bill_number = b.bill_number
left join cosponsors as c
    on c.congress = b.congress and c.bill_type = b.bill_type and c.bill_number = b.bill_number
left join votes as v
    on v.congress = b.congress and v.bill_type = b.bill_type and v.bill_number = b.bill_number
left join {{ ref('stg_bill_scope') }} as scope
    on scope.congress = b.congress
    and scope.bill_type = b.bill_type
    and scope.bill_number = b.bill_number
