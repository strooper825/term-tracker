-- One row per Senate Periodic Transaction Report of a tracked senator, typed from
-- raw.senate_ptr_report (ADR 0026). `status` is what reading the eFD page gave: parsed, paper
-- (page images, nothing to read) or failed (the table did not read back whole). `report_for` is
-- the date in the report's title; `filing_date` is the day eFD lists it as submitted, which for
-- an amendment is the day of the amendment. `amendment` is 0 for an original. `supersedes` is the
-- report an amendment replaces, matched by the rows they share (ingest.senate_efd).
select
    r.report_id,
    r.bioguide_id,
    r.status,
    r.error,
    to_date(r.payload -> 'search' ->> 'filed', 'MM/DD/YYYY') as filing_date,
    to_date(r.payload -> 'search' ->> 'report_for', 'MM/DD/YYYY') as report_for,
    (r.payload -> 'search' ->> 'amendment')::int as amendment,
    r.payload -> 'search' ->> 'title' as title,
    (r.payload -> 'report' ->> 'pages')::int as pages,
    r.supersedes,
    r.supersedes_note,
    r.source_url,
    r.fetched_at
from {{ source('raw', 'senate_ptr_report') }} as r
