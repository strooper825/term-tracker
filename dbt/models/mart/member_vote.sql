-- One row per (tracked member, roll call). position is normalised (Yea, Nay, Present,
-- Not Voting, Other); position_raw keeps the upstream value, e.g. "Aye" or a Speaker candidate.
with positions as (
    select congress, chamber, session, roll_number, bioguide_id, position, position_raw,
           source, source_url, fetched_at
    from {{ ref('stg_house_member_votes') }}
    union all
    select congress, chamber, session, roll_number, bioguide_id, position, position_raw,
           source, source_url, fetched_at
    from {{ ref('stg_senate_member_votes') }}
)

select
    p.bioguide_id,
    p.congress,
    p.chamber,
    p.session,
    p.roll_number,
    p.position,
    p.position_raw,
    p.position <> 'Not Voting' as voted,
    p.source,
    p.source_url,
    p.fetched_at
from positions as p
inner join {{ ref('tracked_members') }} as tm on tm.bioguide_id = p.bioguide_id
