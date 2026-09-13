-- One row per tracked member and Congress: attendance and party unity.
--
-- party_unity_pct (plan section 4): share of the member's Yea/Nay votes that matched the
-- majority position of the member's scoring party on that roll call (ties give no majority
-- and are excluded). party_unity_cq_pct: the same, restricted to roll calls where majorities
-- of the Republican and Democratic members opposed each other (the CQ "party unity vote"
-- definition, the basis of most published figures). Present, Other, and Not Voting never
-- count as agreement or disagreement.
--
-- Scoring party (ADR 0005): the party on the vote record, except that an Independent who
-- caucuses with a party (congress-legislators `caucus`) is scored with, and counted in the
-- majority of, that caucus. Majorities exist only for R and D, so a member scored under any
-- other letter gets no party-unity figure rather than a degenerate one.
with caucus_party as (
    select distinct on (t.bioguide_id)
        t.bioguide_id,
        case t.caucus when 'Democrat' then 'D' when 'Republican' then 'R' end as caucus_letter
    from {{ ref('stg_legislator_terms') }} as t
    where t.caucus is not null
        and t.end_date > '{{ var("current_congress_start") }}'::date
        and t.start_date < '{{ var("current_congress_end") }}'::date
    order by t.bioguide_id, t.start_date desc
),

raw_positions as (
    select congress, chamber, session, roll_number, bioguide_id, party, position
    from {{ ref('stg_house_member_votes') }}
    union all
    select congress, chamber, session, roll_number, bioguide_id, party, position
    from {{ ref('stg_senate_member_votes') }}
),

positions as (
    select
        p.congress,
        p.chamber,
        p.session,
        p.roll_number,
        p.bioguide_id,
        coalesce(cp.caucus_letter, p.party) as party,
        p.position
    from raw_positions as p
    left join caucus_party as cp on cp.bioguide_id = p.bioguide_id
),

party_majorities as (
    select
        congress,
        chamber,
        session,
        roll_number,
        party,
        count(*) filter (where position = 'Yea') as yea,
        count(*) filter (where position = 'Nay') as nay,
        case
            when count(*) filter (where position = 'Yea') > count(*) filter (where position = 'Nay')
                then 'Yea'
            when count(*) filter (where position = 'Nay') > count(*) filter (where position = 'Yea')
                then 'Nay'
        end as majority_position
    from positions
    where position in ('Yea', 'Nay') and party in ('R', 'D')
    group by 1, 2, 3, 4, 5
),

cq_votes as (
    select r.congress, r.chamber, r.session, r.roll_number
    from party_majorities as r
    inner join party_majorities as d
        on d.congress = r.congress and d.chamber = r.chamber
        and d.session = r.session and d.roll_number = r.roll_number
    where r.party = 'R' and d.party = 'D'
        and r.majority_position is not null and d.majority_position is not null
        and r.majority_position <> d.majority_position
),

member_positions as (
    select
        p.bioguide_id,
        p.congress,
        p.chamber,
        p.party,
        p.position,
        m.majority_position,
        cq.congress is not null as is_cq_vote
    from positions as p
    inner join {{ ref('tracked_members') }} as tm on tm.bioguide_id = p.bioguide_id
    left join party_majorities as m
        on m.congress = p.congress and m.chamber = p.chamber
        and m.session = p.session and m.roll_number = p.roll_number and m.party = p.party
    left join cq_votes as cq
        on cq.congress = p.congress and cq.chamber = p.chamber
        and cq.session = p.session and cq.roll_number = p.roll_number
),

chamber_calls as (
    select congress, chamber, count(*) as roll_calls, max(fetched_at) as fetched_at
    from {{ ref('roll_call') }}
    group by 1, 2
),

counts as (
    select
        bioguide_id,
        congress,
        chamber,
        count(*) as positions,
        count(*) filter (where position <> 'Not Voting') as votes_cast,
        count(*) filter (where position = 'Not Voting') as not_voting,
        -- the scoring party on the member's most recent roll call in the Congress
        (array_agg(party order by position is null))[1] as scoring_party,
        count(*) filter (where position in ('Yea', 'Nay') and majority_position is not null)
            as party_votes,
        count(*) filter (where position in ('Yea', 'Nay') and position = majority_position)
            as party_agreements,
        count(*) filter (
            where is_cq_vote and position in ('Yea', 'Nay') and majority_position is not null
        ) as cq_party_votes,
        count(*) filter (
            where is_cq_vote and position in ('Yea', 'Nay') and position = majority_position
        ) as cq_party_agreements
    from member_positions
    group by 1, 2, 3
)

select
    c.bioguide_id,
    c.congress,
    c.chamber,
    cc.roll_calls,
    c.positions,
    c.votes_cast,
    c.not_voting,
    round(100.0 * c.votes_cast / nullif(c.positions, 0), 2) as attendance_pct,
    round(100.0 * c.not_voting / nullif(c.positions, 0), 2) as missed_vote_pct,
    c.scoring_party,
    c.party_votes,
    c.party_agreements,
    round(100.0 * c.party_agreements / nullif(c.party_votes, 0), 2) as party_unity_pct,
    c.cq_party_votes,
    c.cq_party_agreements,
    round(100.0 * c.cq_party_agreements / nullif(c.cq_party_votes, 0), 2) as party_unity_cq_pct,
    case c.chamber when 'house' then 'congress_gov' else 'senate_gov' end as source,
    case c.chamber
        when 'house' then 'https://api.congress.gov/v3/house-vote/' || c.congress::text
        else 'https://www.senate.gov/legislative/LIS/roll_call_lists/'
    end as source_url,
    cc.fetched_at
from counts as c
left join chamber_calls as cc on cc.congress = c.congress and cc.chamber = c.chamber
