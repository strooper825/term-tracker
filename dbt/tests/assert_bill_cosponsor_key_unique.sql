-- (congress, bill_type, bill_number, bioguide_id) is the natural key of mart.bill_cosponsor,
-- and (congress, bill_type, bill_number, version_code) that of mart.bill_summary.
select congress, bill_type, bill_number, bioguide_id as key_part, count(*) as n
from {{ ref('bill_cosponsor') }}
group by 1, 2, 3, 4
having count(*) > 1

union all

select congress, bill_type, bill_number, version_code as key_part, count(*) as n
from {{ ref('bill_summary') }}
group by 1, 2, 3, 4
having count(*) > 1
