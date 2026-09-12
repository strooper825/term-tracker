-- One row per tracked member. photo_url follows the Congress.gov member-image convention
-- (the same URL the Congress.gov API returns as depiction.imageUrl); Phase 1b replaces it
-- with the value fetched from the API.
select
    l.bioguide_id,
    l.first_name,
    l.last_name,
    coalesce(l.official_full_name, l.first_name || ' ' || l.last_name) as official_full_name,
    l.govtrack_id,
    l.icpsr_id,
    l.fec_ids,
    'https://www.congress.gov/img/member/' || lower(l.bioguide_id) || '_200.jpg' as photo_url,
    l.source,
    l.source_url,
    l.fetched_at
from {{ ref('stg_legislators') }} as l
inner join {{ ref('tracked_members') }} as tm on tm.bioguide_id = l.bioguide_id
