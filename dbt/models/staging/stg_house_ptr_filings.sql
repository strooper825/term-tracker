-- One row per House Periodic Transaction Report of a tracked member, typed from
-- raw.house_ptr_filing (ADR 0018). `status` is what reading the PDF gave: parsed, scanned (paper
-- form, no text layer) or failed (text but no whole table). `filing_date` casts the index's
-- m/d/yyyy; a value Postgres cannot read fails the build rather than becoming a null.
select
    f.doc_id,
    f.bioguide_id,
    f.year,
    f.status,
    f.error,
    to_date(f.payload -> 'index' ->> 'FilingDate', 'MM/DD/YYYY') as filing_date,
    (f.payload -> 'pdf' ->> 'pages')::int as pages,
    f.source_url as pdf_url,
    f.fetched_at
from {{ source('raw', 'house_ptr_filing') }} as f
