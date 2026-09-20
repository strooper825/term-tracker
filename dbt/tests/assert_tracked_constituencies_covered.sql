{{ config(severity='warn') }}
-- A warning, not a failure: a tracked member whose constituency has no map or no demographics
-- for the tracked Congress. That is expected when a new Congress's lines are not published yet
-- (ADR 0015), and failing here would take down the nightly ingest, the failure mode ADR 0011
-- was written for. The Constituency tab shows what exists and says the rest is not published.
select
    m.bioguide_id,
    m.label,
    m.has_map,
    d.geoid is not null as has_demographics
from {{ ref('member_constituency') }} as m
left join {{ ref('constituency_demographics') }} as d
    on d.congress = m.congress
    and d.fips_state = m.fips_state
    and d.district is not distinct from m.district
where not m.has_map or d.geoid is null
