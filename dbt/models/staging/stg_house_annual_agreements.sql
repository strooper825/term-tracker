-- One row per line of Schedule F (Agreements) of a read House annual report
-- (raw.annual_report_row, part 'F', ADR 0031), in the columns of stg_annual_report_agreements.
-- Cells: date ("June 1992", or a year), parties to, terms of agreement. The House prints no
-- agreement type, so it is null.
select
    r.source,
    r.doc_id,
    r.bioguide_id,
    r.row_index,
    nullif(r.payload -> 'cells' ->> 'date', '') as agreement_date,
    r.payload -> 'cells' ->> 'parties' as parties,
    null::text as parties_location,
    null::text as agreement_type,
    nullif(r.payload -> 'cells' ->> 'terms', '') as terms,
    nullif(concat_ws('; ',
        r.payload -> 'detail' ->> 'description',
        r.payload -> 'detail' ->> 'comments',
        nullif(r.payload -> 'detail' ->> 'note', '')
    ), '') as comments
from {{ source('raw', 'annual_report_row') }} as r
where r.source = 'house_clerk' and r.part = 'F'
