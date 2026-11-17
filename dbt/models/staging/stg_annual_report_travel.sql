-- One row per line of Part 6 (Travel) of a read Senate annual report (raw.annual_report_row,
-- ADR 0030): a trip someone other than the government paid for. eFD's cells: (blank), #,
-- dates ("05/22/2025 to 05/28/2025"), traveler(s) ("Self , Spouse"), travel type, itinerary,
-- reimbursed for, who paid (with its city as a note), comments.
with rows as (
    select
        r.source,
        r.doc_id,
        r.bioguide_id,
        r.row_index,
        r.payload -> 'cells' as c,
        regexp_match(
            r.payload -> 'cells' -> 2 ->> 'text', '^(\d{2}/\d{2}/\d{4})(?: to (\d{2}/\d{2}/\d{4}))?$'
        ) as dates
    from {{ source('raw', 'annual_report_row') }} as r
    where r.source = 'senate_efd' and r.part = '6'
)

select
    source,
    doc_id,
    bioguide_id,
    row_index,
    to_date(dates[1], 'MM/DD/YYYY') as departed,
    to_date(coalesce(dates[2], dates[1]), 'MM/DD/YYYY') as returned,
    regexp_replace(c -> 3 ->> 'text', '\s*,\s*', ', ', 'g') as travelers,
    nullif(c -> 4 ->> 'text', '') as travel_type,
    nullif(c -> 5 ->> 'text', '') as itinerary,
    nullif(c -> 6 ->> 'text', '') as reimbursed_for,
    c -> 7 ->> 'text' as sponsor,
    c -> 7 -> 'notes' ->> 0 as sponsor_location,
    null::int as days_at_own_expense,
    nullif(nullif(trim(concat_ws(' ',
        c -> 8 ->> 'text',
        array_to_string(array(select jsonb_array_elements_text(c -> 8 -> 'notes')), '; ')
    )), ''), 'n/a') as comments
from rows
