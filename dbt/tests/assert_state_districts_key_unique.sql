-- seeds/state_districts.csv has one row per (state, chamber, district) (ADR 0035).
select state, chamber, district, count(*) as n
from {{ ref('state_districts') }}
group by state, chamber, district
having count(*) > 1
