-- One row per roll-call vote in either chamber, with totals computed from member positions.
-- Natural key (congress, chamber, session, roll_number) per plan section 4.
with calls as (
    select * from {{ ref('stg_house_roll_calls') }}
    union all
    select * from {{ ref('stg_senate_roll_calls') }}
),

positions as (
    select congress, chamber, session, roll_number, position
    from {{ ref('stg_house_member_votes') }}
    union all
    select congress, chamber, session, roll_number, position
    from {{ ref('stg_senate_member_votes') }}
),

totals as (
    select
        congress,
        chamber,
        session,
        roll_number,
        count(*) filter (where position = 'Yea') as yea_total,
        count(*) filter (where position = 'Nay') as nay_total,
        count(*) filter (where position = 'Present') as present_total,
        count(*) filter (where position = 'Not Voting') as not_voting_total,
        count(*) filter (where position = 'Other') as other_total,
        count(*) as member_total
    from positions
    group by 1, 2, 3, 4
)

select
    c.congress,
    c.chamber,
    c.session,
    c.roll_number,
    c.voted_at,
    c.vote_date,
    c.question,
    c.question_short,
    c.result,
    c.vote_type,
    c.majority_requirement,
    c.bill_type,
    c.bill_number,
    c.document_type,
    c.document_number,
    c.document_count,
    c.legislation_url,
    coalesce(t.yea_total, 0) as yea_total,
    coalesce(t.nay_total, 0) as nay_total,
    coalesce(t.present_total, 0) as present_total,
    coalesce(t.not_voting_total, 0) as not_voting_total,
    coalesce(t.other_total, 0) as other_total,
    coalesce(t.member_total, 0) as member_total,
    c.source,
    c.source_url,
    c.fetched_at
from calls as c
left join totals as t
    on t.congress = c.congress and t.chamber = c.chamber
    and t.session = c.session and t.roll_number = c.roll_number
