-- Every race_nominees row for a loaded member must match that member's seat on this cycle's
-- ballot on that election date, and a House race must be in the member's state. A row that
-- fails is a stale or mistyped seed entry (ADR 0008).
--
-- Only members present in mart.member are checked: on a database with no legislators loaded
-- (CI's dbt build on the empty database) there is no seat to compare against, and every row
-- would fail for that reason alone. A nominee row naming a member who is not tracked at all
-- is caught by the seed's relationships test to tracked_members.
select n.*
from {{ ref('race_nominees') }} as n
inner join {{ ref('member') }} as m on m.bioguide_id = n.bioguide_id
left join {{ ref('member_next_election') }} as e
    on e.bioguide_id = n.bioguide_id
    and e.election_date = n.election_date
    and e.on_ballot_this_cycle
    and e.chamber = n.chamber
    and e.state_abbr = n.state_abbr
where e.bioguide_id is null
    or (n.chamber = 'house' and n.district is null)
    or (n.chamber = 'senate' and n.district is not null)
