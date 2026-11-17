-- One row per line of Schedule H (Travel) of a read House annual report
-- (raw.annual_report_row, part 'H', ADR 0031), in the columns of stg_annual_report_travel.
-- Cells: source (who paid), start date, end date (MM/DD/YYYY), itinerary, days at own expense.
-- The Lodging?, Food? and Family? columns are check marks drawn as graphics and read empty, so
-- they are not used. The House prints no traveler or travel type.
select
    r.source,
    r.doc_id,
    r.bioguide_id,
    r.row_index,
    to_date(r.payload -> 'cells' ->> 'start_date', 'MM/DD/YYYY') as departed,
    to_date(r.payload -> 'cells' ->> 'end_date', 'MM/DD/YYYY') as returned,
    null::text as travelers,
    null::text as travel_type,
    nullif(r.payload -> 'cells' ->> 'itinerary', '') as itinerary,
    null::text as reimbursed_for,
    r.payload -> 'cells' ->> 'source' as sponsor,
    null::text as sponsor_location,
    case when r.payload -> 'cells' ->> 'days_at_own_expense' ~ '^\d+$'
        then (r.payload -> 'cells' ->> 'days_at_own_expense')::int end as days_at_own_expense,
    nullif(concat_ws('; ',
        r.payload -> 'detail' ->> 'description',
        r.payload -> 'detail' ->> 'comments',
        nullif(r.payload -> 'detail' ->> 'note', '')
    ), '') as comments
from {{ source('raw', 'annual_report_row') }} as r
where r.source = 'house_clerk' and r.part = 'H'
