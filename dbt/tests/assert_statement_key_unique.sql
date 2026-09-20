-- (bioguide_id, guid) is the raw key, and the mart keeps it; a repeat would list a release twice.
select bioguide_id, guid, count(*) as n
from {{ ref('statement') }}
group by 1, 2
having count(*) > 1
