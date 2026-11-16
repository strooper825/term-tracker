-- One row per annual-disclosure filing of a tracked member since the tracked Congress began,
-- both chambers (raw.annual_disclosure, ADR 0027). Listed and linked: nothing inside a report is
-- read. `kind` is annual, amendment, new_filer, termination or extension; `covers_year` is the
-- calendar year the report covers, null when the office does not say (an eFD paper report, a
-- new filer or termination report dated by day). `amendment` is eFD's amendment number (0 for an
-- original, null for the House, whose index does not number them).
select
    a.source,
    a.doc_id,
    a.bioguide_id,
    a.kind,
    a.covers_year,
    a.filing_date,
    case when a.source = 'senate_efd' then (a.payload -> 'search' ->> 'amendment')::int end as amendment,
    case when a.source = 'senate_efd' then a.payload -> 'search' ->> 'view' end as efd_view,
    a.source_url,
    a.fetched_at
from {{ source('raw', 'annual_disclosure') }} as a
