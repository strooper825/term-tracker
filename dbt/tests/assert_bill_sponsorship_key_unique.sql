-- (bioguide_id, congress, bill_type, bill_number, role) is the natural key from plan section 4.
-- A member who cosponsors the same bill more than once (ADR 0007) would break it if the
-- cosponsor join were not reduced to their latest stint.
select bioguide_id, congress, bill_type, bill_number, role, count(*) as n
from {{ ref('bill_sponsorship') }}
group by 1, 2, 3, 4, 5
having count(*) > 1
