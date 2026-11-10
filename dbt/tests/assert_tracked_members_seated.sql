-- Every tracked member has a term in force during the tracked Congress. Fails the build, and so
-- holds the deploy, when one does not (ADR 0021).
--
-- This is the gate on moving to a new Congress. congress-legislators lists a House member's
-- new term only once its maintainers have recorded the swearing-in, so on the first days of a
-- Congress the tracked House members have no term at all: the rehearsal of 2026-11-09 left 7 of
-- 20 members with one. A site built then would show thirteen members with no seat, no term
-- progress and no votes. The same failure names a member who left Congress and is still in
-- seeds/tracked_members.csv, which is a roster change to make, not data to wait for.
--
-- Members are taken from mart.member rather than the seed so a fixture database, whose
-- legislators file holds only some tracked members, still passes.
select
    m.bioguide_id,
    m.official_full_name,
    {{ var('current_congress') }} as tracked_congress
from {{ ref('member') }} as m
left join {{ ref('term') }} as t on t.bioguide_id = m.bioguide_id
where t.bioguide_id is null
