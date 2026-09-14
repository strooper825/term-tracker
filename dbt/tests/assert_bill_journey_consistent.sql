-- The journey has one row per (bill, stage); every bill (kind bill) has its Introduced stage; the
-- shown stages run from 1 without gaps; nothing is shown after a stage that ends the journey; and
-- a passed or failed chamber stage points at a roll call in mart.bill_passage_vote (ADR 0009).
select congress, bill_type, bill_number, 'duplicate stage ' || stage_key as problem
from {{ ref('bill_journey_stage') }}
group by congress, bill_type, bill_number, stage_key
having count(*) > 1

union all

select b.congress, b.bill_type, b.bill_number, 'no introduced stage'
from {{ ref('bill') }} as b
where b.kind = 'bill'
    and not exists (
        select 1
        from {{ ref('bill_journey_stage') }} as j
        where j.congress = b.congress
            and j.bill_type = b.bill_type
            and j.bill_number = b.bill_number
            and j.stage_key = 'introduced'
    )

union all

select congress, bill_type, bill_number, 'shown stages are not contiguous'
from {{ ref('bill_journey_stage') }}
where is_shown
group by congress, bill_type, bill_number
having max(stage_order) <> count(*)

union all

select j.congress, j.bill_type, j.bill_number, 'stage shown after the journey ended'
from {{ ref('bill_journey_stage') }} as j
where j.is_shown
    and exists (
        select 1
        from {{ ref('bill_journey_stage') }} as e
        where e.congress = j.congress
            and e.bill_type = j.bill_type
            and e.bill_number = j.bill_number
            and e.ends_journey
            and e.stage_order < j.stage_order
    )

union all

select j.congress, j.bill_type, j.bill_number, 'vote stage without its roll call'
from {{ ref('bill_journey_stage') }} as j
where j.status in ('passed', 'failed')
    and not exists (
        select 1
        from {{ ref('bill_passage_vote') }} as v
        where v.congress = j.congress
            and v.bill_type = j.bill_type
            and v.bill_number = j.bill_number
            and v.chamber = j.vote_chamber
            and v.session = j.vote_session
            and v.roll_number = j.vote_roll_number
    )
