-- One row per tracked member: the header panel (plan section 2, panel 1) for the current
-- Congress. Days remaining is computed by the API from term_end_date at request time.
with latest_term as (
    select distinct on (bioguide_id) *
    from {{ ref('term') }}
    order by bioguide_id, start_date desc
),

bills as (
    select
        bioguide_id,
        count(*) filter (where role = 'sponsor') as bills_sponsored,
        count(*) filter (where role = 'cosponsor') as bills_cosponsored,
        max(fetched_at) as bills_fetched_at
    from {{ ref('bill_sponsorship') }}
    where congress = {{ var('current_congress') }}
    group by 1
),

committees as (
    select bioguide_id, count(*) as committees
    from {{ ref('committee_membership') }}
    where congress = {{ var('current_congress') }}
    group by 1
),

-- Chairmanships of full committees (no parent), joint committees included; subcommittee
-- chairs are excluded and Vice Chair does not count.
chairmanships as (
    select cm.bioguide_id, count(*) as chairmanships
    from {{ ref('committee_membership') }} as cm
    inner join {{ ref('committee') }} as c on c.thomas_id = cm.committee_thomas_id
    where cm.congress = {{ var('current_congress') }}
        and c.parent_thomas_id is null
        and cm.title ilike 'chair%'
    group by 1
)

select
    m.bioguide_id,
    m.first_name,
    m.last_name,
    m.official_full_name,
    m.photo_url,
    m.govtrack_id,
    m.icpsr_id,
    m.fec_ids,
    t.congress,
    t.chamber,
    t.party,
    t.state_abbr,
    t.state_name,
    t.fips_state,
    t.district,
    t.senate_class,
    t.state_rank,
    t.start_date as term_start_date,
    t.end_date as term_end_date,
    t.end_congress as term_end_congress,
    {{ var('current_congress') }}::int as tracked_congress,
    s.roll_calls,
    coalesce(s.positions, 0) as positions,
    coalesce(s.votes_cast, 0) as votes_cast,
    coalesce(s.not_voting, 0) as not_voting,
    s.attendance_pct,
    s.missed_vote_pct,
    s.party_unity_pct,
    s.party_unity_cq_pct,
    coalesce(b.bills_sponsored, 0) as bills_sponsored,
    coalesce(b.bills_cosponsored, 0) as bills_cosponsored,
    coalesce(c.committees, 0) as committees,
    coalesce(ch.chairmanships, 0) as chairmanships,
    m.source,
    m.source_url,
    m.fetched_at
from {{ ref('member') }} as m
inner join latest_term as t on t.bioguide_id = m.bioguide_id
left join {{ ref('member_vote_stats') }} as s
    on s.bioguide_id = m.bioguide_id and s.congress = {{ var('current_congress') }}
left join bills as b on b.bioguide_id = m.bioguide_id
left join committees as c on c.bioguide_id = m.bioguide_id
left join chairmanships as ch on ch.bioguide_id = m.bioguide_id
