-- One row per line of Schedule G (Gifts) of a read House annual report
-- (raw.annual_report_row, part 'G', ADR 0031), in the columns of stg_annual_report_gifts.
-- Cells: source ("Catherine B. Davis (Durham, NC, US)", the giver and their city), description,
-- value. The House prints no date or recipient, so those are null.
with rows as (
    select
        r.source,
        r.doc_id,
        r.bioguide_id,
        r.row_index,
        r.payload -> 'cells' as c,
        r.payload -> 'detail' as d,
        regexp_match(r.payload -> 'cells' ->> 'source', '^(.*\S)\s*\(([^()]*)\)$') as giver,
        regexp_match(r.payload -> 'cells' ->> 'value', '^\$([0-9,]+(?:\.[0-9]+)?)$') as exact
    from {{ source('raw', 'annual_report_row') }} as r
    where r.source = 'house_clerk' and r.part = 'G'
)

select
    source,
    doc_id,
    bioguide_id,
    row_index,
    null::date as gift_date,
    null::text as owner_code,
    c ->> 'description' as gift,
    c ->> 'value' as value_raw,
    replace(exact[1], ',', '')::numeric(16, 2) as value,
    coalesce(giver[1], c ->> 'source') as giver,
    giver[2] as giver_location,
    nullif(concat_ws('; ', d ->> 'description', d ->> 'comments', nullif(d ->> 'note', '')), '')
        as comments
from rows
