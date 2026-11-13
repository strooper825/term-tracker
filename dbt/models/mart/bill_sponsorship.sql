-- One row per (tracked member, bill or amendment, role). For a sponsor, date is the
-- introduction date; for a cosponsor it is the date they joined, from the cosponsors endpoint.
--
-- Both roles are read from the bill's own records: the sponsor on its detail record, the
-- cosponsors from its cosponsors list (ADR 0023). Until then the rows came from each member's
-- sponsored and cosponsored lists; on the twenty-member database of 2026-11-13 the two give
-- the same 6,373 rows. The members' lists are no longer read by anything in the mart, which
-- also retires the lag ADR 0011 worked around: there is one endpoint now, so a cosponsorship
-- appears here in the same build as its date.
--
-- A member who cosponsors, withdraws, and cosponsors the same bill again has more than one
-- entry in the cosponsors list, so their most recent stint is taken; without that the member
-- would gain a second row here and be counted twice (ADR 0007).
with cosponsorships as (
    select distinct on (congress, bill_type, bill_number, bioguide_id) *
    from {{ ref('stg_bill_cosponsors') }}
    order by congress, bill_type, bill_number, bioguide_id, sponsorship_date desc
)

select
    b.sponsor_bioguide_id as bioguide_id,
    b.congress,
    b.bill_type,
    b.bill_number,
    'sponsor' as role,
    b.introduced_date as date,
    null::boolean as is_original_cosponsor,
    null::date as withdrawn_date,
    b.source,
    b.source_url,
    b.fetched_at
from {{ ref('stg_bills') }} as b
inner join {{ ref('tracked_members') }} as tm on tm.bioguide_id = b.sponsor_bioguide_id

union all

select
    c.bioguide_id,
    c.congress,
    c.bill_type,
    c.bill_number,
    'cosponsor' as role,
    c.sponsorship_date as date,
    c.is_original_cosponsor,
    c.withdrawn_date,
    c.source,
    c.source_url,
    c.fetched_at
from cosponsorships as c
inner join {{ ref('tracked_members') }} as tm on tm.bioguide_id = c.bioguide_id
-- the bill's own row is what gives it a page; both are stored in one transaction
inner join {{ ref('stg_bills') }} as b
    on b.congress = c.congress and b.bill_type = c.bill_type and b.bill_number = c.bill_number
