-- One row per cosponsor of every bill in mart.bill, tracked members and everyone else alike.
-- This is what the bill page lists; mart.bill_sponsorship stays the tracked-member view that
-- the member dashboard counts.
--
-- Grain is one row per (bill, member). A member who cosponsors, withdraws, and cosponsors
-- again appears once, with their most recent stint; the earlier ones stay in
-- staging.stg_bill_cosponsors and in raw. One case in the 119th Congress so far
-- (S. 1383, Warnock) -- see docs/adr/0007-repeat-cosponsorship.md.
--
-- Scoped against stg_bills rather than mart.bill so that mart.bill can count these rows
-- without the two models referencing each other.
with latest_stint as (
    select distinct on (congress, bill_type, bill_number, bioguide_id) *
    from {{ ref('stg_bill_cosponsors') }}
    order by congress, bill_type, bill_number, bioguide_id, sponsorship_date desc
),

stints as (
    select congress, bill_type, bill_number, bioguide_id, count(*) as stints
    from {{ ref('stg_bill_cosponsors') }}
    group by 1, 2, 3, 4
)

select
    c.congress,
    c.bill_type,
    c.bill_number,
    c.bioguide_id,
    c.full_name,
    coalesce(c.display_name, c.full_name) as display_name,
    c.party,
    c.state,
    c.district,
    c.sponsorship_date,
    c.is_original_cosponsor,
    c.withdrawn_date,
    c.withdrawn_date is not null as is_withdrawn,
    s.stints as cosponsorships,
    tm.bioguide_id is not null as is_tracked_member,
    c.source,
    c.source_url,
    c.fetched_at
from latest_stint as c
inner join {{ ref('stg_bills') }} as b
    on b.congress = c.congress and b.bill_type = c.bill_type and b.bill_number = c.bill_number
inner join stints as s
    on s.congress = c.congress and s.bill_type = c.bill_type
    and s.bill_number = c.bill_number and s.bioguide_id = c.bioguide_id
left join {{ ref('tracked_members') }} as tm on tm.bioguide_id = c.bioguide_id
