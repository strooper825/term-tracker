-- One row per line of Part 7 (Liabilities) of a read annual report (raw.annual_report_row,
-- ADR 0028). eFD's cells: (blank), #, incurred, debtor, type, points, rate (term), amount,
-- creditor (with its city as a note), comments. The amount is a band, or a top band with no upper
-- end; anything else is `other` and kept as printed.
with rows as (
    select
        r.source,
        r.doc_id,
        r.bioguide_id,
        r.row_index,
        r.payload -> 'cells' as c,
        regexp_match(r.payload -> 'cells' -> 7 ->> 'text', '^\$([0-9,]+) - \$([0-9,]+)$') as band,
        regexp_match(r.payload -> 'cells' -> 7 ->> 'text', '^(?:Spouse/DC )?Over \$([0-9,]+)$') as over
    from {{ source('raw', 'annual_report_row') }} as r
    where r.part = '7'
)

select
    source,
    doc_id,
    bioguide_id,
    row_index,
    nullif(c -> 2 ->> 'text', '') as incurred,
    case c -> 3 ->> 'text'
        when 'Self' then 'SELF'
        when 'Spouse' then 'SP'
        when 'Joint' then 'JT'
        when 'Child' then 'DC'
        when 'Dependent Child' then 'DC'
        else c -> 3 ->> 'text'
    end as owner_code,
    c -> 4 ->> 'text' as liability_type,
    nullif(c -> 6 ->> 'text', '') as rate,
    c -> 7 ->> 'text' as amount_raw,
    case when band is not null then 'band' when over is not null then 'top_band' else 'other' end
        as amount_kind,
    coalesce(replace(band[1], ',', ''), replace(over[1], ',', ''))::numeric(16, 2) as amount_low,
    replace(band[2], ',', '')::numeric(16, 2) as amount_high,
    c -> 8 ->> 'text' as creditor,
    nullif(nullif(trim(concat_ws(' ',
        c -> 9 ->> 'text',
        array_to_string(array(select jsonb_array_elements_text(c -> 9 -> 'notes')), '; ')
    )), ''), 'n/a') as comments
from rows
