-- term_history natural key: one row per (bioguide_id, term_index).
select bioguide_id, term_index, count(*) as n
from {{ ref('term_history') }}
group by 1, 2
having count(*) > 1
