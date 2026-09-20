-- (acs_year, fips_state, district) is the natural key; district null means the state itself.
select acs_year, fips_state, district, count(*) as n
from {{ ref('constituency_demographics') }}
group by 1, 2, 3
having count(*) > 1
