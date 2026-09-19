-- The overview's figures agree with each other and with the rows beside them (ADR 0013):
-- the chamber splits add up to their totals, the measure-type bar adds up to bills introduced,
-- every tracked member is counted in one chamber, and the table outcomes fit inside passed_both.
select 'chamber splits do not add up' as problem
from {{ ref('congress_overview') }}
where introduced_house + introduced_senate <> bills_introduced
    or passed_chamber_house_origin + passed_chamber_senate_origin <> passed_chamber
    or roll_call_votes_house + roll_call_votes_senate <> roll_call_votes
    or vetoed_overridden + vetoed_not_overridden <> vetoed
    or tracked_house + tracked_senate <> tracked_members

union all

select 'passed_both is smaller than its outcomes'
from {{ ref('congress_overview') }}
where passed_both < passed_both_enacted + passed_both_adopted + passed_both_vetoed
    or passed_both > passed_chamber

union all

select 'became_law is more than passed_a_chamber'
from {{ ref('congress_overview') }}
where became_law > bills_introduced or passed_chamber > bills_introduced

union all

select 'measure types do not add up to bills introduced'
from {{ ref('congress_overview') }} as o
where o.bills_introduced <> (select sum(bills) from {{ ref('congress_overview_type') }})

