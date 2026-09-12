-- Committee and subcommittee assignments of tracked members in the current Congress.
select
    m.bioguide_id,
    m.committee_id as committee_thomas_id,
    {{ var('current_congress') }}::int as congress,
    m.rank,
    m.title,
    m.party,
    m.source,
    m.source_url,
    m.fetched_at
from {{ ref('stg_committee_memberships') }} as m
inner join {{ ref('tracked_members') }} as tm on tm.bioguide_id = m.bioguide_id
