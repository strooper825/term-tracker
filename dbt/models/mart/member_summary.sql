-- One row per tracked member: the header panel (plan section 2, panel 1) for the current
-- Congress. Days remaining and age are computed by the API at request time from
-- term_end_date and birthday.
with latest_term as (
    select distinct on (bioguide_id) *
    from {{ ref('term') }}
    order by bioguide_id, start_date desc
),

-- Service record from the full term history. Terms are contiguous when the next one begins
-- in the same or the following Congress (a House term ending 2015-01-03 and a Senate term
-- beginning 2015-01-06 count as continuous service); "serving since" is the start of the
-- current unbroken run, "Nth term" counts every term served.
history as (
    select
        h.bioguide_id,
        h.term_index,
        h.chamber,
        h.congress,
        h.start_date,
        case
            when h.congress > lag(h.end_congress) over member_terms + 1 then 1 else 0
        end as run_break,
        case
            when h.congress > lag(h.end_congress) over member_chamber_terms + 1 then 1 else 0
        end as chamber_run_break
    from {{ ref('term_history') }} as h
    window
        member_terms as (partition by h.bioguide_id order by h.term_index),
        member_chamber_terms as (partition by h.bioguide_id, h.chamber order by h.term_index)
),

runs as (
    select
        h.*,
        sum(h.run_break) over (partition by h.bioguide_id order by h.term_index) as run_id,
        sum(h.chamber_run_break)
            over (partition by h.bioguide_id, h.chamber order by h.term_index) as chamber_run_id
    from history as h
),

last_runs as (
    select
        r.bioguide_id,
        max(r.run_id) as last_run,
        max(r.chamber_run_id) filter (where r.chamber = lt.chamber) as last_chamber_run
    from runs as r
    inner join latest_term as lt on lt.bioguide_id = r.bioguide_id
    group by 1
),

service as (
    select
        r.bioguide_id,
        count(*) as term_count,
        min(r.start_date) as first_term_start_date,
        min(r.start_date) filter (where r.run_id = x.last_run) as serving_since_date,
        count(*) filter (where r.chamber = lt.chamber) as chamber_term_count,
        min(r.start_date) filter (
            where r.chamber = lt.chamber and r.chamber_run_id = x.last_chamber_run
        ) as chamber_since_date
    from runs as r
    inner join latest_term as lt on lt.bioguide_id = r.bioguide_id
    inner join last_runs as x on x.bioguide_id = r.bioguide_id
    group by 1
),

-- The leadership role currently held (latest start when several are open).
leadership as (
    select distinct on (bioguide_id) bioguide_id, title as leadership_title
    from {{ ref('leadership_role') }}
    where is_current
    order by bioguide_id, start_date desc, role_index desc
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
    m.middle_name,
    m.last_name,
    m.nickname,
    m.suffix,
    m.official_full_name,
    m.birthday,
    m.gender,
    m.photo_url,
    m.govtrack_id,
    m.icpsr_id,
    m.lis_id,
    m.fec_ids,
    m.opensecrets_id,
    m.wikipedia_id,
    m.ballotpedia_id,
    m.cspan_id,
    m.votesmart_id,
    m.wikidata_id,
    t.congress,
    t.chamber,
    t.party,
    t.caucus,
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
    sv.term_count,
    sv.first_term_start_date,
    sv.serving_since_date,
    sv.chamber_term_count,
    sv.chamber_since_date,
    ld.leadership_title,
    s.roll_calls,
    coalesce(s.positions, 0) as positions,
    coalesce(s.votes_cast, 0) as votes_cast,
    coalesce(s.not_voting, 0) as not_voting,
    s.attendance_pct,
    s.missed_vote_pct,
    s.scoring_party,
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
inner join service as sv on sv.bioguide_id = m.bioguide_id
left join leadership as ld on ld.bioguide_id = m.bioguide_id
left join {{ ref('member_vote_stats') }} as s
    on s.bioguide_id = m.bioguide_id and s.congress = {{ var('current_congress') }}
left join bills as b on b.bioguide_id = m.bioguide_id
left join committees as c on c.bioguide_id = m.bioguide_id
left join chairmanships as ch on ch.bioguide_id = m.bioguide_id
