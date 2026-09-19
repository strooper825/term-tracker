-- The overview's figures agree with each other (ADR 0013): the chamber splits add up to their
-- totals, every tracked member is counted in one chamber, and the table outcomes fit inside
-- passed_both. The tracked-member counts and the dataset counts are different scopes, so they
-- are only compared within their own scope.
select 'chamber splits do not add up' as problem
from {{ ref('congress_overview') }}
where introduced_house + introduced_senate <> bills_introduced
    or passed_chamber_house_origin + passed_chamber_senate_origin <> passed_chamber
    or vetoed_overridden + vetoed_not_overridden <> vetoed
    or tracked_house + tracked_senate <> tracked_members

union all

select 'passed_both is smaller than its outcomes'
from {{ ref('congress_overview') }}
where passed_both < passed_both_enacted + passed_both_adopted + passed_both_vetoed
    or passed_both > bills_in_dataset

union all

select 'tracked-member counts exceed their own bills'
from {{ ref('congress_overview') }}
where became_law > passed_chamber
    or passed_chamber > bills_introduced
    or bills_introduced > bills_in_dataset
