-- One row per (tracked member, bill or amendment, role). For a sponsor, date is the
-- introduction date; for a cosponsor it is the date they joined, from the cosponsors endpoint.
--
-- A member who cosponsors, withdraws, and cosponsors the same bill again has more than one
-- entry in the cosponsors list, so the join takes their most recent stint; without that the
-- member would gain a second row here and be counted twice (ADR 0007).
with cosponsorships as (
    select distinct on (congress, bill_type, bill_number, bioguide_id) *
    from {{ ref('stg_bill_cosponsors') }}
    order by congress, bill_type, bill_number, bioguide_id, sponsorship_date desc
)

select
    ml.bioguide_id,
    ml.congress,
    ml.bill_type,
    ml.bill_number,
    ml.role,
    case ml.role
        when 'sponsor' then b.introduced_date
        else c.sponsorship_date
    end as date,
    case ml.role when 'cosponsor' then c.is_original_cosponsor end as is_original_cosponsor,
    c.withdrawn_date,
    ml.source,
    ml.source_url,
    ml.fetched_at
from {{ ref('stg_member_legislation') }} as ml
inner join {{ ref('tracked_members') }} as tm on tm.bioguide_id = ml.bioguide_id
left join {{ ref('stg_bills') }} as b
    on b.congress = ml.congress and b.bill_type = ml.bill_type and b.bill_number = ml.bill_number
left join cosponsorships as c
    on ml.role = 'cosponsor'
    and c.congress = ml.congress and c.bill_type = ml.bill_type and c.bill_number = ml.bill_number
    and c.bioguide_id = ml.bioguide_id
