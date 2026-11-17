-- Every legislator seated on the States section's day sits in a district that
-- seeds/state_districts.csv knows (ADR 0035). A miss means Open States renamed a district or a
-- state redrew its lines: rerun `python -m ingest.state_maps` and commit the seed and maps.
select state, chamber, district, person_id, name
from {{ ref('state_seat_holder') }}
where district_seats is null
