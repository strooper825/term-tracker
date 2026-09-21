-- One row per transaction row of a parsed House PTR, read out of the strings the PDF prints
-- (raw.house_ptr_transaction, ADR 0018). Dates are m/d/yyyy. The asset cell ends with a two-
-- character asset-type code in brackets; the ticker is the last parenthetical before it when it
-- looks like one (a CUSIP such as 91282CGH8 does not, so a bond keeps it in the name). An
-- amount is `$a - $b` (a band), `Over $a` or `Spouse/DC Over $a` (a top band, no upper bound) or a single figure
-- such as `$823.45`, which a filer may enter instead of a band (`amount_kind` says which). No code is dropped
-- or rewritten here: the raw codes go through to the mart, which maps them with the seeds.
with rows as (
    select
        t.*,
        t.payload ->> 'asset' as asset_text
    from {{ source('raw', 'house_ptr_transaction') }} as t
),

parsed as (
    select
        r.*,
        (regexp_match(r.asset_text, '\[([A-Z0-9]{2})\]$'))[1] as asset_type_code,
        (regexp_match(r.asset_text, '\(([A-Z][A-Z0-9]{0,4}(?:[./-][A-Z]{1,2})?)\)\s*\[[A-Z0-9]{2}\]$'))[1] as ticker,
        regexp_match(r.payload ->> 'amount', '^\$([0-9,]+) - \$([0-9,]+)$') as amount_range,
        regexp_match(r.payload ->> 'amount', '^(?:Spouse/DC )?Over \$([0-9,]+)$') as amount_over,
        regexp_match(r.payload ->> 'amount', '^\$([0-9,]+(?:\.[0-9]{2})?)$') as amount_exact
    from rows as r
)

select
    p.doc_id,
    p.row_number,
    p.bioguide_id,
    (p.payload ->> 'page')::int as page,
    coalesce(p.payload ->> 'owner', 'SELF') as owner_code,
    p.asset_text,
    p.asset_type_code,
    p.ticker,
    trim(regexp_replace(
        p.asset_text,
        case when p.ticker is not null
            then '\s*\([^()]*\)\s*\[[A-Z0-9]{2}\]$'
            else '\s*\[[A-Z0-9]{2}\]$'
        end,
        ''
    )) as asset_name,
    p.payload ->> 'type' as transaction_type_code,
    to_date(p.payload ->> 'trade_date', 'MM/DD/YYYY') as trade_date,
    to_date(p.payload ->> 'notification_date', 'MM/DD/YYYY') as notification_date,
    p.payload ->> 'amount' as amount_raw,
    case
        when p.amount_range is not null then 'band'
        when p.amount_over is not null then 'top_band'
        else 'exact'
    end as amount_kind,
    coalesce(
        replace(p.amount_range[1], ',', ''),
        replace(p.amount_over[1], ',', ''),
        replace(p.amount_exact[1], ',', '')
    )::numeric(14, 2) as amount_low,
    coalesce(replace(p.amount_range[2], ',', ''), replace(p.amount_exact[1], ',', ''))::numeric(14, 2) as amount_high,
    p.payload -> 'detail' ->> 'filing_status' as filing_status,
    p.payload -> 'detail' ->> 'subholding_of' as subholding_of,
    p.payload -> 'detail' ->> 'description' as description,
    p.payload -> 'detail' ->> 'location' as location,
    p.payload -> 'detail' ->> 'comments' as comments,
    p.source_url,
    p.fetched_at
from parsed as p
