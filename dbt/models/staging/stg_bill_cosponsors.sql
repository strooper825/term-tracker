-- One row per cosponsor of a bill or amendment, unnested from raw.bill_cosponsors.
select
    c.congress,
    c.bill_type,
    c.bill_number,
    x.value ->> 'bioguideId' as bioguide_id,
    (x.value ->> 'sponsorshipDate')::date as sponsorship_date,
    (x.value ->> 'isOriginalCosponsor')::boolean as is_original_cosponsor,
    (x.value ->> 'sponsorshipWithdrawnDate')::date as withdrawn_date,
    'congress_gov' as source,
    c.source_url,
    c.fetched_at
from {{ source('raw', 'bill_cosponsors') }} as c
cross join lateral jsonb_array_elements(c.payload) as x (value)
