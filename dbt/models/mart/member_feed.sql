-- Chronological activity per tracked member (plan section 2, panel 5). One row per event with
-- a stable event_key for cursor pagination. Event types available in Phase 1: vote,
-- bill_sponsored, bill_cosponsored, committee_action (a Committee-type action on a bill the
-- member sponsors). floor_speech arrives in Phase 3.
with votes as (
    select
        v.bioguide_id,
        r.voted_at as event_at,
        r.vote_date as event_date,
        'vote' as event_type,
        'vote:' || r.chamber || ':' || r.session::text || ':' || r.roll_number::text as event_key,
        case
            when v.position = 'Not Voting' then 'Did not vote on '
            when v.position = 'Other' then 'Voted ' || v.position_raw || ' on '
            else 'Voted ' || upper(v.position) || ' on '
        end
        || coalesce({{ bill_label('r.bill_type', 'r.bill_number') }} || ': ', '')
        || coalesce(r.question, 'roll call ' || r.roll_number::text) as headline,
        coalesce(b.title, r.result) as detail,
        v.position,
        r.chamber,
        r.session,
        r.roll_number,
        r.bill_type,
        r.bill_number,
        b.congress_gov_url as url,
        v.source,
        v.source_url,
        v.fetched_at
    from {{ ref('member_vote') }} as v
    inner join {{ ref('roll_call') }} as r
        on r.congress = v.congress and r.chamber = v.chamber
        and r.session = v.session and r.roll_number = v.roll_number
    left join {{ ref('bill') }} as b
        on b.congress = r.congress and b.bill_type = r.bill_type and b.bill_number = r.bill_number
    where v.congress = {{ var('current_congress') }}
),

sponsorships as (
    select
        s.bioguide_id,
        s.date::timestamp at time zone 'America/New_York' as event_at,
        s.date as event_date,
        case s.role when 'sponsor' then 'bill_sponsored' else 'bill_cosponsored' end as event_type,
        'bill_' || s.role || ':' || s.congress::text || ':' || s.bill_type || ':' || s.bill_number
            as event_key,
        case s.role when 'sponsor' then 'Introduced ' else 'Cosponsored ' end
        || {{ bill_label('s.bill_type', 's.bill_number') }} || ': ' || b.title as headline,
        b.latest_action_text as detail,
        null::text as position,
        null::text as chamber,
        null::int as session,
        null::int as roll_number,
        s.bill_type,
        s.bill_number,
        b.congress_gov_url as url,
        s.source,
        s.source_url,
        s.fetched_at
    from {{ ref('bill_sponsorship') }} as s
    inner join {{ ref('bill') }} as b
        on b.congress = s.congress and b.bill_type = s.bill_type and b.bill_number = s.bill_number
    where s.congress = {{ var('current_congress') }} and s.date is not null
),

committee_actions as (
    select
        s.bioguide_id,
        coalesce(
            (a.action_date::text || ' ' || coalesce(a.action_time, '12:00:00'))::timestamp,
            a.action_date::timestamp
        ) at time zone 'America/New_York' as event_at,
        a.action_date as event_date,
        'committee_action' as event_type,
        'action:' || a.congress::text || ':' || a.bill_type || ':' || a.bill_number || ':'
            || a.action_date::text || ':' || a.action_hash as event_key,
        {{ bill_label('a.bill_type', 'a.bill_number') }} || ': ' || coalesce(a.action_text, a.action_code)
            as headline,
        b.title as detail,
        null::text as position,
        null::text as chamber,
        null::int as session,
        null::int as roll_number,
        a.bill_type,
        a.bill_number,
        b.congress_gov_url as url,
        a.source,
        a.source_url,
        a.fetched_at
    from {{ ref('bill_action') }} as a
    inner join {{ ref('bill_sponsorship') }} as s
        on s.congress = a.congress and s.bill_type = a.bill_type and s.bill_number = a.bill_number
        and s.role = 'sponsor'
    inner join {{ ref('bill') }} as b
        on b.congress = a.congress and b.bill_type = a.bill_type and b.bill_number = a.bill_number
    where a.congress = {{ var('current_congress') }} and a.action_type = 'Committee'
)

select * from votes
union all
select * from sponsorships
union all
select * from committee_actions
