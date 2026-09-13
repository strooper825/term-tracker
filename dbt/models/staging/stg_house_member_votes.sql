-- One row per (House roll call, member position), every member, not only tracked ones.
select
    m.congress,
    'house' as chamber,
    m.session,
    m.roll_number,
    x.value ->> 'bioguideID' as bioguide_id,
    x.value ->> 'voteCast' as position_raw,
    {{ normalize_position("x.value ->> 'voteCast'") }} as position,
    x.value ->> 'voteParty' as party,
    x.value ->> 'voteState' as state,
    'congress_gov' as source,
    m.source_url,
    m.fetched_at
from {{ source('raw', 'house_vote_members') }} as m
cross join lateral jsonb_array_elements(m.payload -> 'results') as x (value)
