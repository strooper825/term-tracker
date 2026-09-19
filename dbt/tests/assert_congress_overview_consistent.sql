-- The overview's figures agree with each other (ADR 0013): the chamber splits add up to their
-- totals, and each figure fits inside the one it is a subset of. Every count covers the same
-- bills (everything in mart.bill), so they can be compared directly.
select 'chamber splits do not add up' as problem
from {{ ref('congress_overview') }}
where bills_house + bills_senate <> bills_in_dataset
    or passed_chamber_house_origin + passed_chamber_senate_origin <> passed_chamber
    or vetoed_overridden + vetoed_not_overridden <> vetoed

union all

select 'a subset is larger than its whole'
from {{ ref('congress_overview') }}
where became_law > passed_chamber
    or passed_both > passed_chamber
    or passed_chamber > bills_in_dataset
    or passed_both < passed_both_enacted + passed_both_adopted + passed_both_vetoed
