-- How many seats each party group holds in each state legislative chamber on the States section's
-- day (ADR 0035): the segments of the chamber's bar. party is the federal letter (R, D, I, N) the
-- site colours by; party_group keeps Puerto Rico's parties and the independents apart. Vacant
-- seats are state_chamber.vacant; non-voting members are left out.
select
    state,
    chamber,
    party_group,
    min(party) as party,
    count(*) as seats
from {{ ref('state_seat_holder') }}
where is_seated and not is_non_voting
group by state, chamber, party_group
