-- One row: every aggregate figure on /congress (ADR 0013), plus the tracked-member split by
-- chamber and the Congress's own dates. The site renders these columns and computes nothing;
-- percentages are here, rounded to one decimal.
--
-- Two scopes, and the page keeps them apart:
--   tracked members  bills_introduced through vetoed count bills a tracked member sponsored
--                    (sponsor_is_tracked), and sit below the scope-change divider.
--   the dataset      bills_in_dataset and the passed_both_* counts cover every bill in
--                    mart.bill (the tracked members' bills plus any bill a loaded roll call
--                    names), which is not every bill in Congress.
with tracked as (
    select
        count(*) as bills_introduced,
        count(*) filter (where origin_chamber = 'House') as introduced_house,
        count(*) filter (where origin_chamber = 'Senate') as introduced_senate,
        count(*) filter (where passed_a_chamber) as passed_chamber,
        count(*) filter (where passed_a_chamber and origin_chamber = 'House')
            as passed_chamber_house_origin,
        count(*) filter (where passed_a_chamber and origin_chamber = 'Senate')
            as passed_chamber_senate_origin,
        count(*) filter (where became_law) as became_law,
        count(*) filter (where vetoed) as vetoed,
        count(*) filter (where veto_overridden) as vetoed_overridden,
        count(*) filter (where vetoed and not veto_overridden) as vetoed_not_overridden
    from {{ ref('congress_bill_outcome') }}
    where sponsor_is_tracked
),

dataset as (
    select
        count(*) as bills_in_dataset,
        count(*) filter (where passed_both_chambers) as passed_both,
        count(*) filter (where passed_both_chambers and outcome = 'law') as passed_both_enacted,
        count(*) filter (where passed_both_chambers and outcome = 'adopted') as passed_both_adopted,
        count(*) filter (where passed_both_chambers and outcome in ('vetoed', 'overridden'))
            as passed_both_vetoed,
        max(fetched_at) as fetched_at
    from {{ ref('congress_bill_outcome') }}
),

members as (
    select
        count(*) as tracked_members,
        count(*) filter (where chamber = 'house') as tracked_house,
        count(*) filter (where chamber = 'senate') as tracked_senate
    from {{ ref('member_summary') }}
)

select
    {{ var('current_congress') }}::int as congress,
    '{{ var("current_congress_start") }}'::date as congress_start,
    '{{ var("current_congress_end") }}'::date as congress_end,
    m.tracked_members,
    m.tracked_house,
    m.tracked_senate,
    t.bills_introduced,
    t.introduced_house,
    t.introduced_senate,
    t.passed_chamber,
    t.passed_chamber_house_origin,
    t.passed_chamber_senate_origin,
    t.became_law,
    round(100.0 * t.became_law / nullif(t.bills_introduced, 0), 1) as became_law_pct,
    t.vetoed,
    t.vetoed_overridden,
    t.vetoed_not_overridden,
    d.bills_in_dataset,
    d.passed_both,
    d.passed_both_enacted,
    d.passed_both_adopted,
    d.passed_both_vetoed,
    'congress_gov' as source,
    'https://www.congress.gov/' as source_url,
    d.fetched_at
from tracked as t
cross join dataset as d
cross join members as m
