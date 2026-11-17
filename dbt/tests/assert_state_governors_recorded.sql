{{ config(severity='warn') }}
-- States with no governor (DC: no mayor) on the States section's day (ADR 0035). Usually a new
-- governor Open States has not recorded yet; the state's page says so until it does.
select state, state_name
from {{ ref('state_government') }}
where governor_person_id is null
