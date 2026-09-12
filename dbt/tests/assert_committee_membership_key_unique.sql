select bioguide_id, committee_thomas_id, congress, count(*) as n
from {{ ref('committee_membership') }}
group by 1, 2, 3
having count(*) > 1
