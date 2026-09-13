-- Exactly one summary version per bill is marked is_latest, and the counts on mart.bill agree
-- with the rows in mart.bill_summary and mart.bill_cosponsor.
select b.congress, b.bill_type, b.bill_number, 'latest count' as problem
from {{ ref('bill') }} as b
inner join {{ ref('bill_summary') }} as s
    on s.congress = b.congress and s.bill_type = b.bill_type and s.bill_number = b.bill_number
group by 1, 2, 3, 4
having count(*) filter (where s.is_latest) <> 1

union all

select b.congress, b.bill_type, b.bill_number, 'summary_count' as problem
from {{ ref('bill') }} as b
left join {{ ref('bill_summary') }} as s
    on s.congress = b.congress and s.bill_type = b.bill_type and s.bill_number = b.bill_number
group by 1, 2, 3, 4, b.summary_count
having count(s.version_code) <> b.summary_count

union all

select b.congress, b.bill_type, b.bill_number, 'cosponsor_count' as problem
from {{ ref('bill') }} as b
left join {{ ref('bill_cosponsor') }} as c
    on c.congress = b.congress and c.bill_type = b.bill_type and c.bill_number = b.bill_number
group by 1, 2, 3, 4, b.cosponsor_count, b.cosponsors_democratic, b.cosponsors_republican,
    b.cosponsors_other
having count(c.bioguide_id) <> b.cosponsor_count
    or b.cosponsors_democratic + b.cosponsors_republican + b.cosponsors_other
        <> b.cosponsor_count
