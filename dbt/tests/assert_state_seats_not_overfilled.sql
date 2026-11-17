{{ config(severity='warn') }}
-- People in a legislative role on the States section's day who were not seated because their
-- district already had as many people as seats (ADR 0035). Usually a role Open States opened
-- without closing the predecessor's, or one with no start date; the site shows the people with
-- the latest known start dates.
select state, chamber, district, district_seats, person_id, name, start_date
from {{ ref('state_seat_holder') }}
where not is_seated
