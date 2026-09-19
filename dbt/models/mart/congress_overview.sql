-- One row: every aggregate figure on /congress (ADR 0013), plus the Congress's own dates. The
-- site renders these columns and computes nothing; percentages are here, rounded to one decimal.
--
-- Every legislative figure covers every bill in mart.bill (kind bill), whoever sponsored it: the
-- bills a tracked member sponsored or cosponsored plus any bill a loaded roll call names. That
-- is not every bill in Congress, so the first figure is named bills_in_dataset rather than
-- "introduced". tracked_members is only there so the page can say whose bills seeded the dataset.
with bills as (
    select
        count(*) as bills_in_dataset,
        count(*) filter (where origin_chamber = 'House') as bills_house,
        count(*) filter (where origin_chamber = 'Senate') as bills_senate,
        count(*) filter (where passed_a_chamber) as passed_chamber,
        count(*) filter (where passed_a_chamber and origin_chamber = 'House')
            as passed_chamber_house_origin,
        count(*) filter (where passed_a_chamber and origin_chamber = 'Senate')
            as passed_chamber_senate_origin,
        count(*) filter (where became_law) as became_law,
        count(*) filter (where vetoed) as vetoed,
        count(*) filter (where veto_overridden) as vetoed_overridden,
        count(*) filter (where vetoed and not veto_overridden) as vetoed_not_overridden,
        count(*) filter (where passed_both_chambers) as passed_both,
        count(*) filter (where passed_both_chambers and outcome = 'law') as passed_both_enacted,
        count(*) filter (where passed_both_chambers and outcome = 'adopted') as passed_both_adopted,
        count(*) filter (where passed_both_chambers and outcome in ('vetoed', 'overridden'))
            as passed_both_vetoed,
        max(fetched_at) as fetched_at
    from {{ ref('congress_bill_outcome') }}
),

members as (
    select count(*) as tracked_members
    from {{ ref('member_summary') }}
)

select
    {{ var('current_congress') }}::int as congress,
    '{{ var("current_congress_start") }}'::date as congress_start,
    '{{ var("current_congress_end") }}'::date as congress_end,
    m.tracked_members,
    b.bills_in_dataset,
    b.bills_house,
    b.bills_senate,
    b.passed_chamber,
    b.passed_chamber_house_origin,
    b.passed_chamber_senate_origin,
    b.became_law,
    round(100.0 * b.became_law / nullif(b.bills_in_dataset, 0), 1) as became_law_pct,
    b.vetoed,
    b.vetoed_overridden,
    b.vetoed_not_overridden,
    b.passed_both,
    b.passed_both_enacted,
    b.passed_both_adopted,
    b.passed_both_vetoed,
    'congress_gov' as source,
    'https://www.congress.gov/' as source_url,
    b.fetched_at
from bills as b
cross join members as m
