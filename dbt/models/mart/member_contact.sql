-- One row per tracked member: how to reach them, from the latest term in congress-legislators.
-- Every column but the key is null when the source has no value. A member with no contact
-- information at all still gets a row, and the site shows the Contact tab as not yet published.
select
    t.bioguide_id,
    t.website_url,
    t.contact_form_url,
    t.phone,
    t.fax,
    t.office,
    t.address,
    t.rss_url,
    t.source,
    t.source_url,
    t.fetched_at
from {{ ref('stg_legislator_terms') }} as t
inner join {{ ref('tracked_members') }} as tm on tm.bioguide_id = t.bioguide_id
where t.term_index = (
    select max(x.term_index)
    from {{ ref('stg_legislator_terms') }} as x
    where x.bioguide_id = t.bioguide_id
)
