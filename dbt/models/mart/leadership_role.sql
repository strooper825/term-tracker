-- Party and chamber leadership roles of tracked members, as congress-legislators records them
-- (Speaker, Majority/Minority Leader, whips, conference and caucus officers). Upstream
-- records one entry per Congress, so a title held continuously appears once per Congress.
-- end_date is null while the role is held.
select
    r.bioguide_id,
    r.role_index,
    r.title,
    r.chamber,
    r.start_date,
    r.end_date,
    r.end_date is null as is_current,
    r.source,
    r.source_url,
    r.fetched_at
from {{ ref('stg_legislator_leadership_roles') }} as r
inner join {{ ref('tracked_members') }} as tm on tm.bioguide_id = r.bioguide_id
