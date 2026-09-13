-- One row per (Senate roll call, senator position). Senators are identified upstream by their
-- LIS id; bioguide_id comes from congress-legislators (null for a senator no longer serving,
-- since legislators-current only lists sitting members).
select
    v.congress,
    'senate' as chamber,
    v.session,
    v.vote_number as roll_number,
    x.value ->> 'lis_member_id' as lis_member_id,
    l.bioguide_id,
    x.value ->> 'vote_cast' as position_raw,
    {{ normalize_position("x.value ->> 'vote_cast'") }} as position,
    x.value ->> 'party' as party,
    x.value ->> 'state' as state,
    'senate_gov' as source,
    v.source_url,
    v.fetched_at
from {{ source('raw', 'senate_vote') }} as v
cross join lateral jsonb_array_elements(v.payload -> 'members' -> 'member') as x (value)
left join {{ ref('stg_legislators') }} as l on l.lis_id = x.value ->> 'lis_member_id'
