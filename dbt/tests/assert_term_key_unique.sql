-- (bioguide_id, congress, chamber, start_date) is the natural key from plan section 4.
select bioguide_id, congress, chamber, start_date, count(*) as n
from {{ ref('term') }}
group by 1, 2, 3, 4
having count(*) > 1
