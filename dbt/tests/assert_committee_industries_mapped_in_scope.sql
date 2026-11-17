-- A committee with industry rows is marked mapped in committee_industry_scope, and one marked
-- mapped has rows (ADR 0032); a SIC range runs low to high.
select s.committee_thomas_id, s.mapped, count(i.committee_thomas_id) as industry_rows
from {{ ref('committee_industry_scope') }} as s
left join {{ ref('committee_industries') }} as i on i.committee_thomas_id = s.committee_thomas_id
group by 1, 2
having s.mapped <> (count(i.committee_thomas_id) > 0)
union all
select committee_thomas_id, true, sic_from
from {{ ref('committee_industries') }}
where sic_from > sic_to
