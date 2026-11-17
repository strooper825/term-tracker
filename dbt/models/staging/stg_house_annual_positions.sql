-- One row per line of Schedule E (Positions) of a read House annual report
-- (raw.annual_report_row, part 'E', ADR 0031), in the columns of stg_annual_report_positions.
-- Cells: position, name of organization. The House prints no dates, location or entity type, so
-- those are null, and `is_current` is unknown (null).
select
    r.source,
    r.doc_id,
    r.bioguide_id,
    r.row_index,
    null::text as position_dates,
    null::boolean as is_current,
    r.payload -> 'cells' ->> 'position' as position_held,
    r.payload -> 'cells' ->> 'organization' as entity,
    null::text as entity_location,
    null::text as entity_type,
    nullif(concat_ws('; ',
        r.payload -> 'detail' ->> 'description',
        r.payload -> 'detail' ->> 'comments',
        nullif(r.payload -> 'detail' ->> 'note', '')
    ), '') as comments
from {{ source('raw', 'annual_report_row') }} as r
where r.source = 'house_clerk' and r.part = 'E'
