-- One row per line of Part 5 (Gifts) of a read Senate annual report (raw.annual_report_row,
-- ADR 0030). eFD's cells: (blank), #, date (MM/DD/YYYY), recipient, gift, value (to the cent),
-- from (with the giver's city as a note), comments.
with rows as (
    select
        r.source,
        r.doc_id,
        r.bioguide_id,
        r.row_index,
        r.payload -> 'cells' as c,
        regexp_match(r.payload -> 'cells' -> 5 ->> 'text', '^\$([0-9,]+(?:\.[0-9]+)?)$') as exact
    from {{ source('raw', 'annual_report_row') }} as r
    where r.source = 'senate_efd' and r.part = '5'
)

select
    source,
    doc_id,
    bioguide_id,
    row_index,
    case when c -> 2 ->> 'text' ~ '^\d{2}/\d{2}/\d{4}$' then to_date(c -> 2 ->> 'text', 'MM/DD/YYYY') end
        as gift_date,
    case c -> 3 ->> 'text'
        when 'Self' then 'SELF'
        when 'Spouse' then 'SP'
        when 'Joint' then 'JT'
        when 'Child' then 'DC'
        when 'Dependent Child' then 'DC'
        else c -> 3 ->> 'text'
    end as owner_code,
    c -> 4 ->> 'text' as gift,
    c -> 5 ->> 'text' as value_raw,
    replace(exact[1], ',', '')::numeric(16, 2) as value,
    c -> 6 ->> 'text' as giver,
    c -> 6 -> 'notes' ->> 0 as giver_location,
    nullif(nullif(trim(concat_ws(' ',
        c -> 7 ->> 'text',
        array_to_string(array(select jsonb_array_elements_text(c -> 7 -> 'notes')), '; ')
    )), ''), 'n/a') as comments
from rows
