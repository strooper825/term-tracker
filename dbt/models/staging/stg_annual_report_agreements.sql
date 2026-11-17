-- One row per line of Part 9 (Agreements) of a read Senate annual report (raw.annual_report_row,
-- ADR 0030): an arrangement for future employment, a leave of absence, continuing payments from
-- a former employer or a pension plan, or royalties. eFD's cells: (blank), #, date ("Aug 2020"),
-- parties involved (with their city as a note), type, status and terms, comments.
with rows as (
    select r.source, r.doc_id, r.bioguide_id, r.row_index, r.payload -> 'cells' as c
    from {{ source('raw', 'annual_report_row') }} as r
    where r.source = 'senate_efd' and r.part = '9'
)

select
    source,
    doc_id,
    bioguide_id,
    row_index,
    nullif(c -> 2 ->> 'text', '') as agreement_date,
    c -> 3 ->> 'text' as parties,
    c -> 3 -> 'notes' ->> 0 as parties_location,
    regexp_replace(c -> 4 ->> 'text', '^Other \((.*)\)$', '\1') as agreement_type,
    nullif(c -> 5 ->> 'text', '') as terms,
    nullif(nullif(trim(concat_ws(' ',
        c -> 6 ->> 'text',
        array_to_string(array(select jsonb_array_elements_text(c -> 6 -> 'notes')), '; ')
    )), ''), 'n/a') as comments
from rows
