-- The election date member_next_election derives (2 U.S.C. 7) must agree with the
-- hand-maintained congress-wide election day in key_dates for every seat on this cycle's
-- ballot, so the two cards on a dashboard cannot disagree.
select e.bioguide_id, e.election_date
from {{ ref('member_next_election') }} as e
where e.on_ballot_this_cycle
    and not exists (
        select 1
        from {{ ref('key_dates') }} as k
        where k.kind = 'election' and k.scope = 'congress' and k.date = e.election_date
    )
