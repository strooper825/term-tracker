-- Every district map is drawn inside its state's frame, so a district row without the state row
-- of the same Congress would leave the state view of a House member with nothing to draw on.
select d.congress, d.geoid, d.state_geoid
from {{ ref('stg_constituency_geometry') }} as d
left join {{ ref('stg_constituency_geometry') }} as s
    on s.congress = d.congress and s.kind = 'state' and s.geoid = d.state_geoid
where d.kind = 'district' and s.geoid is null
