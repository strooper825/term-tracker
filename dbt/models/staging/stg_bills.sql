-- One row per bill or amendment from the detail endpoints. Amendments have no title or policy
-- area upstream; a title is composed from the description, purpose, or the amended bill.
select
    congress,
    bill_type,
    bill_number,
    kind,
    case
        when kind = 'bill' then payload ->> 'title'
        else coalesce(
            payload ->> 'description',
            payload ->> 'purpose',
            'Amendment ' || bill_number || ' to '
            || (payload -> 'amendedBill' ->> 'type') || ' ' || (payload -> 'amendedBill' ->> 'number')
        )
    end as title,
    case
        when kind = 'bill' then (payload ->> 'introducedDate')::date
        else (payload ->> 'submittedDate')::timestamptz::date
    end as introduced_date,
    payload -> 'policyArea' ->> 'name' as policy_area,
    (payload -> 'latestAction' ->> 'actionDate')::date as latest_action_date,
    payload -> 'latestAction' ->> 'text' as latest_action_text,
    coalesce(payload ->> 'originChamber', payload ->> 'chamber') as origin_chamber,
    (payload ->> 'updateDate')::timestamptz as update_date,
    payload -> 'sponsors' -> 0 ->> 'bioguideId' as sponsor_bioguide_id,
    -- Every loaded bill carries exactly one sponsor (checked across all 1,874 on 2026-09-13);
    -- amendments carry theirs in the same shape. fullName is the upstream form
    -- "Rep. Steil, Bryan [R-WI-1]"; sponsor_name is the plain "Bryan Steil" the pages show.
    payload -> 'sponsors' -> 0 ->> 'fullName' as sponsor_full_name,
    nullif(
        concat_ws(
            ' ',
            payload -> 'sponsors' -> 0 ->> 'firstName',
            payload -> 'sponsors' -> 0 ->> 'lastName'
        ),
        ''
    ) as sponsor_name,
    payload -> 'sponsors' -> 0 ->> 'party' as sponsor_party,
    payload -> 'sponsors' -> 0 ->> 'state' as sponsor_state,
    (payload -> 'sponsors' -> 0 ->> 'district')::int as sponsor_district,
    (payload -> 'amendedBill' ->> 'congress')::int as amended_bill_congress,
    lower(payload -> 'amendedBill' ->> 'type') as amended_bill_type,
    payload -> 'amendedBill' ->> 'number' as amended_bill_number,
    'congress_gov' as source,
    source_url,
    fetched_at
from {{ source('raw', 'bill') }}
