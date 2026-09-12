-- Every sponsorship row must point at a bill row (the loader fetches details for every item).
select s.bioguide_id, s.congress, s.bill_type, s.bill_number
from {{ ref('bill_sponsorship') }} as s
left join {{ ref('bill') }} as b
    on b.congress = s.congress and b.bill_type = s.bill_type and b.bill_number = s.bill_number
where b.congress is null
