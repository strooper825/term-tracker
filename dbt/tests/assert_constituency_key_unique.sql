-- (fips_state, district) is the natural key; district null means the state itself.
select fips_state, district, count(*) as n
from {{ ref('constituency') }}
group by 1, 2
having count(*) > 1
