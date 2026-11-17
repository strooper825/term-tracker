-- Every top-level committee a tracked member sits on is in committee_industry_scope, mapped or
-- not (ADR 0032), so a committee added at a new Congress cannot go unreviewed: it fails here
-- until someone decides whether it oversees an industry.
select distinct m.committee_thomas_id, c.name
from {{ ref('committee_membership') }} as m
inner join {{ ref('committee') }} as c on c.thomas_id = m.committee_thomas_id
where c.parent_thomas_id is null
  and m.committee_thomas_id not in (select committee_thomas_id from {{ ref('committee_industry_scope') }})
