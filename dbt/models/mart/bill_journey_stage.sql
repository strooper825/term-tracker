-- One row per stage of a bill's vote journey (ADR 0009). This is not a bill status: every stage
-- reads one completed record, a passage roll call (mart.bill_passage_vote) or a Library of
-- Congress late-stage action code, and a stage with neither is pending.
--
-- Stages by bill type, the chamber of origin first:
--   hr, hjres        Introduced, House vote, Senate vote, To President, Became law
--   s, sjres         Introduced, Senate vote, House vote, To President, Became law
--   hconres/sconres  Introduced, then both chamber votes, origin first (no President)
--   hres / sres      Introduced, then the one chamber's vote
--
-- Status:
--   complete      Introduced (always), To President (action E20000 presented, E30000 signed,
--                 vetoed or unsigned, or E40000), Became law (E40000 or type BecameLaw)
--   passed/failed the latest passage roll call in that chamber
--   vetoed        Became law stage when E30000 "Vetoed by President." is recorded and no law
--   no_roll_call  a chamber stage with no passage roll call although a later stage is on record
--                 (the chamber acted by voice vote or unanimous consent; the page says only that
--                 no roll call exists, not how the chamber acted)
--   not_recorded  To President with no action although Became law is on record
--   pending       nothing recorded, and nothing recorded after it
-- A failed or vetoed stage with nothing recorded after it ends the journey: ends_journey is true
-- on it, and every later stage has is_shown false rather than looking still possible.
with bills as (
    select congress, bill_type, bill_number, introduced_date, source, source_url, fetched_at
    from {{ ref('bill') }}
    where kind = 'bill'
),

stage_plan (bill_type, stage_key, stage_order) as (
    values
        ('hr', 'introduced', 1), ('hr', 'house_vote', 2), ('hr', 'senate_vote', 3),
        ('hr', 'to_president', 4), ('hr', 'became_law', 5),
        ('hjres', 'introduced', 1), ('hjres', 'house_vote', 2), ('hjres', 'senate_vote', 3),
        ('hjres', 'to_president', 4), ('hjres', 'became_law', 5),
        ('s', 'introduced', 1), ('s', 'senate_vote', 2), ('s', 'house_vote', 3),
        ('s', 'to_president', 4), ('s', 'became_law', 5),
        ('sjres', 'introduced', 1), ('sjres', 'senate_vote', 2), ('sjres', 'house_vote', 3),
        ('sjres', 'to_president', 4), ('sjres', 'became_law', 5),
        ('hconres', 'introduced', 1), ('hconres', 'house_vote', 2), ('hconres', 'senate_vote', 3),
        ('sconres', 'introduced', 1), ('sconres', 'senate_vote', 2), ('sconres', 'house_vote', 3),
        ('hres', 'introduced', 1), ('hres', 'house_vote', 2),
        ('sres', 'introduced', 1), ('sres', 'senate_vote', 2)
),

votes as (
    select *
    from {{ ref('bill_passage_vote') }}
    where is_latest_in_chamber
),

late as (
    select
        congress,
        bill_type,
        bill_number,
        min(action_date) filter (where action_code = 'E20000') as presented_date,
        min(action_date) filter (where action_code in ('E20000', 'E30000', 'E40000'))
            as president_date,
        min(action_date) filter (where action_code = 'E40000' or action_type = 'BecameLaw')
            as law_date,
        min(action_date) filter (
            where action_code = 'E30000' and action_text ilike 'Vetoed by President%'
        ) as veto_date,
        (array_agg(action_text order by (action_code = 'E20000') desc, action_date, action_seq)
            filter (where action_code in ('E20000', 'E30000', 'E40000')))[1] as president_text,
        (array_agg(action_text order by action_date, action_seq)
            filter (where action_code = 'E40000' or action_type = 'BecameLaw'))[1] as law_text,
        (array_agg(action_text order by action_date, action_seq)
            filter (
                where action_code = 'E30000' and action_text ilike 'Vetoed by President%'
            ))[1] as veto_text
    from {{ ref('bill_action') }}
    group by congress, bill_type, bill_number
),

evidence as (
    select
        b.congress,
        b.bill_type,
        b.bill_number,
        p.stage_key,
        p.stage_order,
        v.chamber as vote_chamber,
        v.session as vote_session,
        v.roll_number as vote_roll_number,
        case
            when p.stage_key = 'introduced' then 'complete'
            when p.stage_key in ('house_vote', 'senate_vote') and v.passed then 'passed'
            when p.stage_key in ('house_vote', 'senate_vote') and not v.passed then 'failed'
            when p.stage_key = 'to_president' and l.president_date is not null then 'complete'
            when p.stage_key = 'became_law' and l.law_date is not null then 'complete'
            when p.stage_key = 'became_law' and l.veto_date is not null then 'vetoed'
        end as evidence_status,
        case p.stage_key
            when 'introduced' then b.introduced_date
            when 'to_president' then coalesce(l.presented_date, l.president_date)
            when 'became_law' then coalesce(l.law_date, l.veto_date)
            else v.vote_date
        end as event_date,
        case p.stage_key
            when 'introduced' then null
            when 'to_president' then l.president_text
            when 'became_law' then coalesce(l.law_text, l.veto_text)
            else v.result
        end as detail,
        b.source,
        b.source_url,
        b.fetched_at
    from bills as b
    inner join stage_plan as p on p.bill_type = b.bill_type
    left join votes as v
        on v.congress = b.congress
        and v.bill_type = b.bill_type
        and v.bill_number = b.bill_number
        and v.chamber = case p.stage_key
            when 'house_vote' then 'house'
            when 'senate_vote' then 'senate'
        end
    left join late as l
        on l.congress = b.congress
        and l.bill_type = b.bill_type
        and l.bill_number = b.bill_number
),

ordered as (
    select
        e.*,
        max(e.stage_order) filter (where e.evidence_status is not null) over (
            partition by e.congress, e.bill_type, e.bill_number
        ) as last_evidence_order
    from evidence as e
),

statused as (
    select
        o.*,
        coalesce(
            o.evidence_status,
            case
                when o.stage_order < o.last_evidence_order
                    and o.stage_key in ('house_vote', 'senate_vote') then 'no_roll_call'
                when o.stage_order < o.last_evidence_order then 'not_recorded'
                else 'pending'
            end
        ) as status
    from ordered as o
),

stops as (
    select
        s.*,
        min(s.stage_order) filter (
            where s.status in ('failed', 'vetoed') and s.stage_order >= s.last_evidence_order
        ) over (partition by s.congress, s.bill_type, s.bill_number) as stop_order
    from statused as s
)

select
    congress,
    bill_type,
    bill_number,
    stage_key,
    case stage_key
        when 'introduced' then 'Introduced'
        when 'house_vote' then 'House vote'
        when 'senate_vote' then 'Senate vote'
        when 'to_president' then 'To President'
        when 'became_law' then 'Became law'
    end as stage_label,
    stage_order,
    status,
    case status
        when 'complete' then case stage_key
            when 'introduced' then 'Introduced'
            when 'to_president' then 'Presented'
            when 'became_law' then 'Enacted'
        end
        when 'passed' then 'Passed'
        when 'failed' then 'Failed'
        when 'vetoed' then 'Vetoed'
        when 'no_roll_call' then 'No roll call vote'
        when 'not_recorded' then 'Not recorded'
        when 'pending' then 'Pending'
    end as status_label,
    event_date,
    detail,
    vote_chamber,
    vote_session,
    vote_roll_number,
    coalesce(stage_order = stop_order, false) as ends_journey,
    stop_order is null or stage_order <= stop_order as is_shown,
    source,
    source_url,
    fetched_at
from stops
