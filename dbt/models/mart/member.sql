-- One row per tracked member: names, biography, and external ids from congress-legislators.
-- photo_url follows the Congress.gov member-image convention (the same URL the Congress.gov
-- API returns as depiction.imageUrl).
select
    l.bioguide_id,
    l.first_name,
    l.middle_name,
    l.last_name,
    l.nickname,
    l.suffix,
    coalesce(l.official_full_name, l.first_name || ' ' || l.last_name) as official_full_name,
    l.birthday,
    l.gender,
    l.govtrack_id,
    l.icpsr_id,
    l.lis_id,
    l.fec_ids,
    l.opensecrets_id,
    l.wikipedia_id,
    l.ballotpedia_id,
    l.cspan_id,
    l.votesmart_id,
    l.wikidata_id,
    'https://www.congress.gov/img/member/' || lower(l.bioguide_id) || '_200.jpg' as photo_url,
    l.source,
    l.source_url,
    l.fetched_at
from {{ ref('stg_legislators') }} as l
inner join {{ ref('tracked_members') }} as tm on tm.bioguide_id = l.bioguide_id
