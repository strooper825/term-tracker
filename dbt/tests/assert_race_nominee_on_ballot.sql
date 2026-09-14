-- Every race_nominees row must name a tracked member whose seat is on this cycle's ballot on
-- that election date, and a House race must be in the member's state. A row that fails is a
-- stale or mistyped seed entry (ADR 0008).
select n.*
from {{ ref('race_nominees') }} as n
left join {{ ref('member_next_election') }} as e
    on e.bioguide_id = n.bioguide_id
    and e.election_date = n.election_date
    and e.on_ballot_this_cycle
    and e.chamber = n.chamber
    and e.state_abbr = n.state_abbr
where e.bioguide_id is null
    or (n.chamber = 'house' and n.district is null)
    or (n.chamber = 'senate' and n.district is not null)
