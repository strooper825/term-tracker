-- One row per tracked member: the general election that began the member's current term, from
-- the MIT Election Lab constituency returns and cited to the Clerk of the House statistics the
-- Lab compiles them from (ADR 0008).
--
-- The contest is the member's latest term's seat as it was at that election (Kiley: CA-3 in
-- 2024, although his next race is in CA-6): office, state, district, general stage, and the
-- year before a January term start (the year itself for a special election).
--
-- Shares exclude blank and over votes throughout: valid_votes counts named candidates,
-- write-ins, scattering and "none of these candidates"; every pct column divides by it.
-- A candidate on several party lines (New York fusion) or several voting-mode rows is one
-- candidate: votes are summed, `party` is the line with the most votes, `party_lines` lists all.
--   status  found       the contest is in the snapshot
--           uncontested the winner was unopposed and the state counted no votes (the files
--                       carry -1 placeholders); names are kept, every count and share is null
--           no_contest  the snapshot holds no row for the contest
--           appointed   the term began by appointment; no election preceded it
with latest_term as (
    select distinct on (t.bioguide_id)
        t.bioguide_id,
        t.chamber,
        t.start_date,
        t.state_abbr,
        t.state_name,
        t.district,
        t.senate_class,
        lt.how
    from {{ ref('term') }} as t
    left join {{ ref('stg_legislator_terms') }} as lt
        on lt.bioguide_id = t.bioguide_id
        and lt.chamber = t.chamber
        and lt.start_date = t.start_date
    order by t.bioguide_id, t.start_date desc
),

target as (
    select
        lt.*,
        coalesce(lt.how, '') = 'special-election' as special,
        extract(year from lt.start_date)::int
        - case when extract(month from lt.start_date) = 1 then 1 else 0 end as election_year
    from latest_term as lt
),

contest_rows as (
    select tg.bioguide_id, r.*
    from target as tg
    inner join {{ ref('stg_election_returns') }} as r
        on r.office = tg.chamber
        and r.year = tg.election_year
        and r.state_po = tg.state_abbr
        and r.stage = 'gen'
        and r.special = tg.special
        and (tg.chamber = 'senate' or r.district = tg.district)
    where coalesce(tg.how, '') <> 'appointment'
),

party_line as (
    select bioguide_id, candidate, party_detailed, sum(candidatevotes) as votes
    from contest_rows
    where vote_kind = 'candidate'
    group by bioguide_id, candidate, party_detailed
),

candidate as (
    select
        bioguide_id,
        candidate,
        sum(votes)::bigint as votes,
        (array_agg(party_detailed order by votes desc, party_detailed))[1] as party_detailed,
        array_agg(party_detailed order by votes desc, party_detailed)
            filter (where party_detailed is not null) as party_lines
    from party_line
    group by bioguide_id, candidate
),

ranked as (
    select
        c.*,
        row_number() over (
            partition by c.bioguide_id order by c.votes desc nulls last, c.candidate
        ) as place,
        count(*) over (partition by c.bioguide_id) as candidates
    from candidate as c
),

totals as (
    select
        bioguide_id,
        coalesce(sum(candidatevotes) filter (
            where vote_kind in {{ election_valid_vote_kinds() }}
        ), 0)::bigint as valid_votes,
        coalesce(sum(candidatevotes) filter (where vote_kind = 'blank'), 0)::bigint as blank_votes,
        coalesce(sum(candidatevotes) filter (where vote_kind = 'over'), 0)::bigint as over_votes,
        coalesce(sum(candidatevotes) filter (where vote_kind = 'mixed'), 0)::bigint as mixed_votes,
        max(totalvotes) as reported_total_votes,
        bool_and(votes_reported) as votes_reported,
        bool_or(unofficial) as unofficial,
        max(dataset_version) as dataset_version,
        max(source_url) as dataset_url,
        max(fetched_at) as fetched_at
    from contest_rows
    group by bioguide_id
)

select
    tg.bioguide_id,
    tg.chamber,
    tg.state_abbr,
    tg.state_name,
    tg.district,
    tg.senate_class,
    tg.election_year,
    tg.special,
    {{ general_election_date('tg.election_year') }} as election_date,
    case
        when coalesce(tg.how, '') = 'appointment' then 'appointed'
        when t.bioguide_id is null then 'no_contest'
        when not t.votes_reported then 'uncontested'
        else 'found'
    end as status,
    w.candidate as winner_name,
    {{ party_label('w.party_detailed') }} as winner_party,
    w.party_lines as winner_party_lines,
    w.votes as winner_votes,
    round(100.0 * w.votes / nullif(t.valid_votes, 0), 2) as winner_pct,
    ru.candidate as runner_up_name,
    {{ party_label('ru.party_detailed') }} as runner_up_party,
    ru.party_lines as runner_up_party_lines,
    ru.votes as runner_up_votes,
    round(100.0 * ru.votes / nullif(t.valid_votes, 0), 2) as runner_up_pct,
    w.votes - coalesce(ru.votes, 0) as margin_votes,
    round(100.0 * (w.votes - coalesce(ru.votes, 0)) / nullif(t.valid_votes, 0), 2) as margin_pct,
    w.candidates,
    t.valid_votes,
    t.blank_votes,
    t.over_votes,
    t.mixed_votes,
    t.reported_total_votes,
    upper(w.candidate) like '%' || upper(m.last_name) || '%' as winner_is_member,
    t.unofficial,
    t.dataset_version,
    t.dataset_url,
    'mit_election_lab' as source,
    case
        when t.bioguide_id is not null
            then 'https://clerk.house.gov/member_info/electionInfo/' || tg.election_year::text
                || '/statistics' || tg.election_year::text || '.pdf'
        else 'https://doi.org/10.7910/DVN/IG0UN2'
    end as source_url,
    coalesce(t.fetched_at, m.fetched_at) as fetched_at
from target as tg
inner join {{ ref('member') }} as m on m.bioguide_id = tg.bioguide_id
left join totals as t on t.bioguide_id = tg.bioguide_id
left join ranked as w on w.bioguide_id = tg.bioguide_id and w.place = 1
left join ranked as ru on ru.bioguide_id = tg.bioguide_id and ru.place = 2
