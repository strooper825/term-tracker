-- Natural keys from plan section 4 for the three bill tables, checked together.
with bill_dupes as (
    select 'bill' as tbl, congress, bill_type, bill_number, null::text as extra, count(*) as n
    from {{ ref('bill') }}
    group by 1, 2, 3, 4, 5
    having count(*) > 1
),

sponsorship_dupes as (
    select 'bill_sponsorship' as tbl, congress, bill_type, bill_number, bioguide_id || ':' || role as extra, count(*) as n
    from {{ ref('bill_sponsorship') }}
    group by 1, 2, 3, 4, 5
    having count(*) > 1
),

action_dupes as (
    select 'bill_action' as tbl, congress, bill_type, bill_number, action_date::text || ':' || action_hash as extra, count(*) as n
    from {{ ref('bill_action') }}
    group by 1, 2, 3, 4, 5
    having count(*) > 1
)

select * from bill_dupes
union all
select * from sponsorship_dupes
union all
select * from action_dupes
