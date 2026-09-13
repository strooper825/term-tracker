-- Every member_vote row must point at a roll_call row.
select v.bioguide_id, v.congress, v.chamber, v.session, v.roll_number
from {{ ref('member_vote') }} as v
left join {{ ref('roll_call') }} as r
    on r.congress = v.congress and r.chamber = v.chamber
    and r.session = v.session and r.roll_number = v.roll_number
where r.congress is null
