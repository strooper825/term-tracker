-- One row: every aggregate figure on /congress below the scope-change divider (ADR 0013),
-- plus the tracked-member split by chamber and the Congress's own dates. The site renders these
-- columns and computes nothing; percentages are here, rounded to one decimal.
--
-- Counts of legislation are over mart.congress_tracked_bill (bills a tracked member sponsored).
-- Roll call votes are votes cast by tracked members (mart.member_vote.voted), not roll calls
-- held, so the figure stays inside the tracked scope. Committee actions are the
-- committee_action events in mart.member_feed.
with bills as (
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
        count(*) filter (where vetoed and not veto_overridden) as vetoed_not_overridden,
        count(*) filter (where measure_type in ('joint_resolution', 'other')) as resolutions,
        count(*) filter (where still_in_committee) as still_in_committee,
        count(*) filter (where passed_both_chambers) as passed_both,
        count(*) filter (where passed_both_chambers and outcome = 'law') as passed_both_enacted,
        count(*) filter (where passed_both_chambers and outcome = 'adopted') as passed_both_adopted,
        count(*) filter (where passed_both_chambers and outcome in ('vetoed', 'overridden'))
            as passed_both_vetoed,
        max(fetched_at) as fetched_at
    from {{ ref('congress_tracked_bill') }}
),

votes as (
    select
        count(*) filter (where voted) as roll_call_votes,
        count(*) filter (where voted and chamber = 'house') as roll_call_votes_house,
        count(*) filter (where voted and chamber = 'senate') as roll_call_votes_senate
    from {{ ref('member_vote') }}
    where congress = {{ var('current_congress') }}
),

committee as (
    select count(*) as committee_actions
    from {{ ref('member_feed') }}
    where event_type = 'committee_action'
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
    b.bills_introduced,
    b.introduced_house,
    b.introduced_senate,
    b.passed_chamber,
    b.passed_chamber_house_origin,
    b.passed_chamber_senate_origin,
    b.became_law,
    round(100.0 * b.became_law / nullif(b.bills_introduced, 0), 1) as became_law_pct,
    b.vetoed,
    b.vetoed_overridden,
    b.vetoed_not_overridden,
    v.roll_call_votes,
    v.roll_call_votes_house,
    v.roll_call_votes_senate,
    c.committee_actions,
    b.resolutions,
    b.still_in_committee,
    round(100.0 * b.still_in_committee / nullif(b.bills_introduced, 0), 1)
        as still_in_committee_pct,
    b.passed_both,
    b.passed_both_enacted,
    b.passed_both_adopted,
    b.passed_both_vetoed,
    'congress_gov' as source,
    'https://www.congress.gov/' as source_url,
    b.fetched_at
from bills as b
cross join votes as v
cross join committee as c
cross join members as m
