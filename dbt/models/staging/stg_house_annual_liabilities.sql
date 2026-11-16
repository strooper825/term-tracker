-- One row per line of Schedule D (Liabilities) of a read House annual report
-- (raw.annual_report_row, part 'D', ADR 0029), in the columns of stg_annual_report_liabilities.
-- Cells: owner (blank is the filer), creditor, date incurred, type, amount. The amount is a band,
-- a top band ("Spouse/DC Over $1,000,000") or an exact figure a filer entered.
with rows as (
    select
        r.source,
        r.doc_id,
        r.bioguide_id,
        r.row_index,
        r.payload -> 'cells' as c,
        r.payload -> 'detail' as d,
        regexp_match(r.payload -> 'cells' ->> 'amount', '^\$([0-9,]+) - \$([0-9,]+)$') as band,
        regexp_match(r.payload -> 'cells' ->> 'amount', '^(?:Spouse/DC )?Over \$([0-9,]+)$') as over,
        regexp_match(r.payload -> 'cells' ->> 'amount', '^\$([0-9,]+(?:\.[0-9]{2})?)$') as exact
    from {{ source('raw', 'annual_report_row') }} as r
    where r.source = 'house_clerk' and r.part = 'D'
)

select
    source,
    doc_id,
    bioguide_id,
    row_index,
    nullif(c ->> 'date_incurred', '') as incurred,
    coalesce(nullif(c ->> 'owner', ''), 'SELF') as owner_code,
    c ->> 'type' as liability_type,
    null::text as rate,
    c ->> 'amount' as amount_raw,
    case
        when band is not null then 'band'
        when over is not null then 'top_band'
        when exact is not null then 'exact'
        else 'other'
    end as amount_kind,
    coalesce(replace(band[1], ',', ''), replace(over[1], ',', ''), replace(exact[1], ',', ''))::numeric(16, 2)
        as amount_low,
    coalesce(replace(band[2], ',', ''), replace(exact[1], ',', ''))::numeric(16, 2) as amount_high,
    c ->> 'creditor' as creditor,
    nullif(concat_ws('; ', d ->> 'description', d ->> 'comments', nullif(d ->> 'note', '')), '')
        as comments
from rows
