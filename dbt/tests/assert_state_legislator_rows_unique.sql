-- Each seated legislator's terms and committee seats are numbered without repeats (ADR 0035):
-- state_legislator_term by term_order, state_committee_member by committee_order and committee.
select 'term' as kind, person_id, term_order::text as key
from {{ ref('state_legislator_term') }}
group by person_id, term_order
having count(*) > 1
union all
select 'committee order', person_id, committee_order::text
from {{ ref('state_committee_member') }}
group by person_id, committee_order
having count(*) > 1
union all
select 'committee', person_id, committee_id
from {{ ref('state_committee_member') }}
group by person_id, committee_id
having count(*) > 1
