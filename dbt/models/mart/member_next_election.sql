-- One row per tracked member: the next regular general election for the seat the member holds,
-- whether it falls in the current cycle, and the opponent when that race is on this cycle's
-- ballot. Computed here rather than in the site (plan section 7; ADR 0008).
--
-- A term ending on January 3 of year Y is filled at the general election of Y - 1, held on the
-- Tuesday after the first Monday in November (2 U.S.C. 7, macro general_election_date): 2026
-- for House members and Class 2 senators this Congress, 2030 for Class 1. Days away are
-- computed by the API on the day it answers, like days remaining in the term.
--
-- The race is the member's seat unless the race_nominees seed records another district
-- (Kiley: seat CA-3, race CA-6 after Proposition 50). opponent_status:
--   confirmed        the seed names the opponent and the source confirming the nomination
--   not_researched   on the ballot this cycle, but no seed row (the field reads "not yet
--                    available"; ADR 0008 caps how far the seed grows)
--   not_on_ballot    the seat's next election is in a later cycle
with latest_term as (
    select distinct on (bioguide_id) *
    from {{ ref('term') }}
    order by bioguide_id, start_date desc
),

cycle as (
    select {{ var('current_congress') }}::int * 2 + 1788 as cycle
),

election as (
    select
        t.*,
        extract(year from t.end_date)::int
        - case when extract(month from t.end_date) = 1 then 1 else 0 end as election_year
    from latest_term as t
)

select
    e.bioguide_id,
    e.chamber,
    e.state_abbr,
    e.state_name,
    e.district as seat_district,
    e.senate_class,
    e.end_date as term_end_date,
    e.election_year,
    {{ general_election_date('e.election_year') }} as election_date,
    cy.cycle,
    e.election_year = cy.cycle as on_ballot_this_cycle,
    case when e.chamber = 'house' then coalesce(n.district, e.district) end as race_district,
    e.chamber = 'house' and coalesce(n.district, e.district) <> e.district
        as race_differs_from_seat,
    case
        when n.bioguide_id is not null then 'confirmed'
        when e.election_year = cy.cycle then 'not_researched'
        else 'not_on_ballot'
    end as opponent_status,
    n.nominee_name as opponent_name,
    n.nominee_party as opponent_party,
    n.fec_candidate_id as opponent_fec_candidate_id,
    case
        when n.fec_candidate_id is not null
            then 'https://www.fec.gov/data/candidate/' || n.fec_candidate_id
                || '/?cycle=' || e.election_year::text || '&election_full=false'
    end as opponent_fec_url,
    n.source_url as opponent_source_url,
    n.verified_on as opponent_verified_on,
    n.note as opponent_note,
    'https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title2-section7'
        as election_date_source_url,
    e.source,
    e.source_url,
    e.fetched_at
from election as e
cross join cycle as cy
left join {{ ref('race_nominees') }} as n
    on n.bioguide_id = e.bioguide_id
    and n.election_date = {{ general_election_date('e.election_year') }}
