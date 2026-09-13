-- One row per cosponsor of a bill or amendment, unnested from raw.bill_cosponsors. Identity
-- fields come from the cosponsors endpoint itself rather than a join to mart.member, because
-- the bill pages list every cosponsor and most of them are not tracked members.
select
    c.congress,
    c.bill_type,
    c.bill_number,
    x.value ->> 'bioguideId' as bioguide_id,
    x.value ->> 'fullName' as full_name,
    -- "Rep. Steil, Bryan [R-WI-1]" upstream; this is the plain "Bryan Steil" the pages show
    nullif(concat_ws(' ', x.value ->> 'firstName', x.value ->> 'lastName'), '') as display_name,
    x.value ->> 'party' as party,
    x.value ->> 'state' as state,
    (x.value ->> 'district')::int as district,
    (x.value ->> 'sponsorshipDate')::date as sponsorship_date,
    (x.value ->> 'isOriginalCosponsor')::boolean as is_original_cosponsor,
    (x.value ->> 'sponsorshipWithdrawnDate')::date as withdrawn_date,
    'congress_gov' as source,
    c.source_url,
    c.fetched_at
from {{ source('raw', 'bill_cosponsors') }} as c
cross join lateral jsonb_array_elements(c.payload) as x (value)
