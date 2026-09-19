-- One row per bill (kind bill) that a tracked member sponsored, with the outcome facts the
-- Congress overview counts (ADR 0013). Everything the overview page shows about legislation is
-- a count or a filter over this table, so the page and a manual query read the same rows.
--
-- Scope: sponsor_is_tracked. Amendments, cosponsored-only bills, and bills that are in
-- mart.bill only because a roll call named them are not here.
--
-- passed_house / passed_senate: the chamber's stage in mart.bill_journey_stage is passed (a
-- passage roll call), or the Library of Congress recorded "Passed/agreed to in House" (action
-- code 8000) or "... in Senate" (17000). Those two codes are the only source of that wording,
-- and every one of the 445 passage roll calls in the mart carries the matching action, so it
-- covers voice votes and unanimous consent, which leave no tally (ADR 0013).
-- vetoed: a "Vetoed by President" action (code E30000). veto_overridden: vetoed and also became
-- law (E40000). Neither has an override roll call to check against, so an overridden veto is
-- read from the bill going on to become law after the veto.
-- still_in_committee: no vote stage past Introduced and no Calendars, Floor, Discharge,
-- President, ResolvingDifferences or Veto action. A derivation from action types, not a
-- Congress.gov status (ADR 0003, ADR 0013).
with tracked as (
    select
        congress,
        bill_type,
        bill_number,
        label,
        title,
        origin_chamber,
        congress_gov_url,
        source,
        source_url,
        fetched_at
    from {{ ref('bill') }}
    where kind = 'bill' and sponsor_is_tracked
),

stages as (
    select
        congress,
        bill_type,
        bill_number,
        max(status) filter (where stage_key = 'house_vote') as house_status,
        max(status) filter (where stage_key = 'senate_vote') as senate_status,
        max(status) filter (where stage_key = 'became_law') as law_status,
        coalesce(bool_or(stage_key <> 'introduced' and status <> 'pending'), false) as has_progress
    from {{ ref('bill_journey_stage') }}
    group by 1, 2, 3
),

late as (
    select
        congress,
        bill_type,
        bill_number,
        coalesce(
            bool_or(action_code = 'E30000' and action_text ilike 'Vetoed by President%'),
            false
        ) as vetoed,
        min(action_date) filter (
            where action_code = 'E30000' and action_text ilike 'Vetoed by President%'
        ) as veto_date,
        min(action_date) filter (where action_code = 'E40000' or action_type = 'BecameLaw')
            as law_date,
        coalesce(bool_or(action_code = '8000'), false) as house_passed_action,
        coalesce(bool_or(action_code = '17000'), false) as senate_passed_action,
        min(action_date) filter (where action_code = '8000') as house_passed_date,
        min(action_date) filter (where action_code = '17000') as senate_passed_date,
        max(substring(action_text from 'Public Law No: ([0-9]+-[0-9]+)'))
            filter (where action_code = 'E40000') as public_law_number,
        coalesce(
            bool_or(action_type in (
                'Calendars', 'Floor', 'Discharge', 'President', 'BecameLaw',
                'ResolvingDifferences', 'Veto'
            )),
            false
        ) as has_floor_action
    from {{ ref('bill_action') }}
    group by 1, 2, 3
),

house_vote as (
    select congress, bill_type, bill_number, yea_total, nay_total
    from {{ ref('bill_passage_vote') }}
    where is_latest_in_chamber and chamber = 'house'
),

senate_vote as (
    select congress, bill_type, bill_number, yea_total, nay_total
    from {{ ref('bill_passage_vote') }}
    where is_latest_in_chamber and chamber = 'senate'
),

joined as (
    select
        t.*,
        s.house_status,
        s.senate_status,
        coalesce(s.house_status = 'passed', false)
            or coalesce(l.house_passed_action, false) as passed_house,
        coalesce(s.senate_status = 'passed', false)
            or coalesce(l.senate_passed_action, false) as passed_senate,
        l.house_passed_date,
        l.senate_passed_date,
        coalesce(s.law_status = 'complete', false) as became_law,
        coalesce(l.vetoed, false) as vetoed,
        l.veto_date,
        l.law_date,
        l.public_law_number,
        not coalesce(s.has_progress, false) and not coalesce(l.has_floor_action, false)
            as still_in_committee,
        hv.yea_total as house_yea,
        hv.nay_total as house_nay,
        sv.yea_total as senate_yea,
        sv.nay_total as senate_nay,
        case
            when t.bill_type = 'hr' then 'house_bill'
            when t.bill_type = 's' then 'senate_bill'
            when t.bill_type in ('hjres', 'sjres') then 'joint_resolution'
            else 'other'
        end as measure_type
    from tracked as t
    left join stages as s using (congress, bill_type, bill_number)
    left join late as l using (congress, bill_type, bill_number)
    left join house_vote as hv using (congress, bill_type, bill_number)
    left join senate_vote as sv using (congress, bill_type, bill_number)
)

select
    congress,
    bill_type,
    bill_number,
    label,
    title,
    origin_chamber,
    measure_type,
    house_status,
    senate_status,
    passed_house,
    passed_senate,
    passed_house or passed_senate as passed_a_chamber,
    -- hres and sres have one chamber stage, so they never pass both
    bill_type not in ('hres', 'sres') and passed_house and passed_senate as passed_both_chambers,
    became_law,
    vetoed,
    vetoed and became_law as veto_overridden,
    -- adopted: a concurrent resolution cleared both chambers; it never goes to the President.
    -- pending: a bill or joint resolution cleared both chambers and is not yet law or vetoed.
    case
        when vetoed and became_law then 'overridden'
        when vetoed then 'vetoed'
        when became_law then 'law'
        when bill_type in ('hconres', 'sconres') and passed_house and passed_senate then 'adopted'
        when bill_type not in ('hres', 'sres') and passed_house and passed_senate then 'pending'
    end as outcome,
    public_law_number,
    coalesce(
        law_date,
        veto_date,
        case when passed_house and passed_senate
            then greatest(house_passed_date, senate_passed_date) end
    ) as outcome_date,
    still_in_committee,
    house_yea,
    house_nay,
    senate_yea,
    senate_nay,
    congress_gov_url,
    source,
    source_url,
    fetched_at
from joined
