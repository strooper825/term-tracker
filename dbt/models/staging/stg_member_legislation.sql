-- One row per (tracked member, role, bill or amendment) from the member list endpoints.
-- Dates on list items are not used: on the cosponsored list, introducedDate is the date the
-- member cosponsored (verified 2026-09-12). See stg_bills and stg_bill_cosponsors instead.
select
    bioguide_id,
    role,
    congress,
    bill_type,
    bill_number,
    payload ->> 'title' as title,
    'congress_gov' as source,
    source_url,
    fetched_at
from {{ source('raw', 'member_legislation') }}
