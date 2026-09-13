-- One totals row per principal committee and cycle, and one per member and cycle.
select committee_id, cycle, count(*) as n
from {{ ref('fec_summary') }}
group by 1, 2
having count(*) > 1
union all
select bioguide_id, cycle, count(*) as n
from {{ ref('member_fundraising') }}
group by 1, 2
having count(*) > 1
