-- One row per line of Part 8 (Positions) of a read Senate annual report (raw.annual_report_row,
-- ADR 0030): a position held outside the Senate during the reporting period or the year before
-- (director, trustee, partner, LLC member). eFD's cells: (blank), #, dates ("Mar 2008 to
-- present"), position held, entity (with its city as a note), entity type, comments.
-- eFD prints a filer's own wording as "Other (Member)"; the wording alone is kept.
-- `is_current` is a position whose dates run "to present".
with rows as (
    select r.source, r.doc_id, r.bioguide_id, r.row_index, r.payload -> 'cells' as c
    from {{ source('raw', 'annual_report_row') }} as r
    where r.source = 'senate_efd' and r.part = '8'
)

select
    source,
    doc_id,
    bioguide_id,
    row_index,
    nullif(c -> 2 ->> 'text', '') as position_dates,
    coalesce(c -> 2 ->> 'text', '') like '% to present' as is_current,
    regexp_replace(c -> 3 ->> 'text', '^Other \((.*)\)$', '\1') as position_held,
    c -> 4 ->> 'text' as entity,
    c -> 4 -> 'notes' ->> 0 as entity_location,
    nullif(regexp_replace(c -> 5 ->> 'text', '^Other \((.*)\)$', '\1'), '') as entity_type,
    nullif(nullif(trim(concat_ws(' ',
        c -> 6 ->> 'text',
        array_to_string(array(select jsonb_array_elements_text(c -> 6 -> 'notes')), '; ')
    )), ''), 'n/a') as comments
from rows
