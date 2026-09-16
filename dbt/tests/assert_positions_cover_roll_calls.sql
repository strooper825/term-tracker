-- Every tracked member has a position row for every roll call held in their chamber while
-- their term was in force (docs/data-dictionary.md, "Attendance"): both sources list every
-- seated member on every roll call, Not Voting included, so a shortfall means a member list
-- was lost or overwritten (for example by trimmed test fixtures loaded into a live database).
-- Members with no position at all in a chamber and Congress are left out so a fixture-only
-- database, where the vote fixtures cover only some tracked members, still passes.
--
-- Exception: the sitting Speaker of the House (ADR 0010). House Rule I, clause 7 excuses the
-- Speaker from voting "except when such vote would be decisive," and the Clerk's roll simply
-- omits the Speaker's name on a roll call he does not join, rather than recording Not Voting.
-- His shortfall is therefore not a lost member list, and is excluded here rather than papered
-- over with an invented Not Voting row.
with expected as (
    select
        t.bioguide_id,
        r.congress,
        r.chamber,
        count(*) as roll_calls
    from {{ ref('term') }} as t
    inner join {{ ref('roll_call') }} as r
        on r.chamber = t.chamber
        and r.vote_date >= t.start_date
        and r.vote_date < t.end_date
    where not exists (
        select 1 from {{ ref('leadership_role') }} as lr
        where lr.bioguide_id = t.bioguide_id
        and lr.title = 'Speaker of the House'
        and lr.is_current
    )
    group by 1, 2, 3
),

actual as (
    select bioguide_id, congress, chamber, count(*) as positions
    from {{ ref('member_vote') }}
    group by 1, 2, 3
)

select
    e.bioguide_id,
    e.congress,
    e.chamber,
    e.roll_calls,
    a.positions
from expected as e
inner join actual as a
    on a.bioguide_id = e.bioguide_id and a.congress = e.congress and a.chamber = e.chamber
where a.positions <> e.roll_calls
