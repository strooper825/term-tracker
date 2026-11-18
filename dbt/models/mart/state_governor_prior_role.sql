-- Legislative service on record for each governor (DC's mayor) before taking office
-- (state_government, ADR 0035): one row per chamber, its first start and last end. A short
-- summary, not a term-by-term history; Open States' records of earlier service are incomplete.
select
    g.state,
    g.governor_person_id as person_id,
    r.chamber,
    c.chamber_name,
    min(r.start_date) as start_date,
    max(r.end_date) as end_date
from {{ ref('state_government') }} as g
inner join {{ ref('stg_state_roles') }} as r
    on r.person_id = g.governor_person_id and r.state = g.state
left join {{ ref('state_chambers') }} as c on c.state = r.state and c.chamber = r.chamber
where r.chamber in ('upper', 'lower', 'legislature')
    and r.end_date is not null
    and r.end_date <= g.governor_since
group by g.state, g.governor_person_id, r.chamber, c.chamber_name
