-- Every term a tracked member has served, in order. Plan section 4 lists only the current
-- term; the header lines "serving since" and "Nth term" need the whole history.
-- Natural key (bioguide_id, term_index). Consecutive terms are contiguous when one starts on
-- the day the previous one ends, which is how congress-legislators records re-elections.
select
    t.bioguide_id,
    t.term_index,
    t.chamber,
    {{ congress_number('t.start_date') }} as congress,
    {{ congress_number('(t.end_date - 1)') }} as end_congress,
    t.start_date,
    t.end_date,
    t.state_abbr,
    case when t.chamber = 'house' then t.district end as district,
    t.senate_class,
    t.party,
    t.caucus,
    t.party_affiliations,
    t.state_rank,
    t.how,
    t.end_type,
    t.source,
    t.source_url,
    t.fetched_at
from {{ ref('stg_legislator_terms') }} as t
inner join {{ ref('tracked_members') }} as tm on tm.bioguide_id = t.bioguide_id
