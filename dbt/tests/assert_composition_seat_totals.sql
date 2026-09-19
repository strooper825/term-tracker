-- The seeded party groups must add up to the chamber (435 House, 100 Senate) and the mart must
-- carry both chambers. A seed that does not add up is a typing error, so this fails the build
-- (ADR 0012); drift against congress-legislators only warns.
select chamber, chamber_seats, 'seats do not add up to the chamber' as problem
from {{ ref('chamber_majority') }}
where (chamber = 'house' and chamber_seats <> 435)
    or (chamber = 'senate' and chamber_seats <> 100)
    or seated + vacant <> chamber_seats

union all

select c.chamber, null, 'seat_pct does not add up to 100'
from {{ ref('chamber_composition') }} as c
group by c.chamber
having abs(sum(c.seat_pct) - 100) > 0.05

union all

select expected.chamber, null, 'chamber missing from the composition'
from (values ('house'), ('senate')) as expected (chamber)
where not exists (
    select 1 from {{ ref('chamber_majority') }} as m where m.chamber = expected.chamber
)
