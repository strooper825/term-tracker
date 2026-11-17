-- Every state, DC and Puerto Rico has a row in state_government, and every chamber in
-- seeds/state_chambers.csv has a row in state_chamber (ADR 0035).
select c.state, 'no state_government row' as problem
from (select distinct state from {{ ref('state_chambers') }}) as c
left join {{ ref('state_government') }} as g on g.state = c.state
where g.state is null
union all
select c.state || ' ' || c.chamber, 'no state_chamber row'
from {{ ref('state_chambers') }} as c
left join {{ ref('state_chamber') }} as m on m.state = c.state and m.chamber = c.chamber
where m.state is null
