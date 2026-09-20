-- One row per tracked member: the constituency they represent in the tracked Congress and its
-- map (ADR 0016). A senator's constituency is the state; a House member's is the district.
-- The map is finished SVG data, drawn by the site as it stands:
--   map_state    the state outline and its county lines, with `district` (the member's district
--                in the state's frame) when the member is in the House and the district is not
--                the whole state
--   map_district the district filling its own frame with the county lines clipped to it; null
--                for a senator and for an at-large district, which is the state view
-- Lines belong to a Congress, so the join takes the rows of the tracked Congress only: a member
-- whose district has no map for it yet (the 120th Congress's new lines before Census publishes
-- them) has has_map false rather than the wrong district's shape. Demographics are joined in the
-- API from mart.constituency_demographics on (congress, fips_state, district).
with latest_term as (
    select distinct on (bioguide_id)
        bioguide_id, chamber, fips_state, state_abbr, district
    from {{ ref('term') }}
    order by bioguide_id, start_date desc
),

seat as (
    select
        t.*,
        t.fips_state
        || case
            when t.district is null then ''
            else lpad(t.district::text, 2, '0')
        end as geoid
    from latest_term as t
),

state_map as (
    select * from {{ ref('stg_constituency_geometry') }}
    where kind = 'state' and congress = {{ var('current_congress') }}
),

district_map as (
    select * from {{ ref('stg_constituency_geometry') }}
    where kind = 'district' and congress = {{ var('current_congress') }}
)

select
    s.bioguide_id,
    s.chamber,
    {{ var('current_congress') }} as congress,
    s.fips_state,
    s.state_abbr,
    s.district,
    c.label,
    s.geoid,
    st.geoid is not null as has_map,
    case
        when st.geoid is not null
        then jsonb_build_object(
            'width', st.frame_width,
            'height', st.frame_height,
            'outline', st.outline,
            'counties', st.counties,
            'district', case when s.district > 0 then dm.in_state end
        )
    end as map_state,
    case
        when s.district > 0 and dm.geoid is not null
        then jsonb_build_object(
            'width', dm.frame_width,
            'height', dm.frame_height,
            'outline', dm.outline,
            'counties', dm.counties
        )
    end as map_district,
    'census_boundary' as source,
    st.source_url as map_source_url,
    case when s.district > 0 then dm.source_url end as map_district_source_url,
    st.county_source_url as map_county_source_url,
    st.fetched_at as map_fetched_at
from seat as s
inner join {{ ref('constituency') }} as c
    on c.fips_state = s.fips_state and c.district is not distinct from s.district
left join state_map as st on st.geoid = s.fips_state
left join district_map as dm on dm.geoid = s.geoid
