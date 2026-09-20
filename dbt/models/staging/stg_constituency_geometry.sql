-- One row per state and House district map in raw.constituency_geometry. `district` is null for
-- a state and 0 for an at-large district (ADR 0001): Census codes at-large as 00 and the
-- delegate districts (DC, the territories) as 98. Paths are finished SVG data, see ADR 0015.
select
    congress,
    geoid,
    kind,
    substr(geoid, 1, 2) as fips_state,
    case
        when kind = 'district'
        then case when substr(geoid, 3, 2) in ('00', '98') then 0 else substr(geoid, 3, 2)::int end
    end as district,
    payload ->> 'name' as name,
    (payload -> 'frame' ->> 'width')::numeric as frame_width,
    (payload -> 'frame' ->> 'height')::numeric as frame_height,
    payload ->> 'outline' as outline,
    payload -> 'counties' as counties,
    payload ->> 'in_state' as in_state,
    payload ->> 'state_geoid' as state_geoid,
    payload ->> 'county_source_url' as county_source_url,
    source_url,
    fetched_at
from {{ source('raw', 'constituency_geometry') }}
