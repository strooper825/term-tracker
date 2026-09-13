-- Natural keys from plan section 4 for roll_call and member_vote, checked together.
with roll_call_dupes as (
    select 'roll_call' as tbl, congress, chamber, session, roll_number, null::text as extra,
           count(*) as n
    from {{ ref('roll_call') }}
    group by 1, 2, 3, 4, 5, 6
    having count(*) > 1
),

member_vote_dupes as (
    select 'member_vote' as tbl, congress, chamber, session, roll_number, bioguide_id as extra,
           count(*) as n
    from {{ ref('member_vote') }}
    group by 1, 2, 3, 4, 5, 6
    having count(*) > 1
)

select * from roll_call_dupes
union all
select * from member_vote_dupes
