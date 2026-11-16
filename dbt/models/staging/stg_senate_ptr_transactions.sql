-- One row per transaction of a parsed Senate PTR, read out of the strings eFD prints
-- (raw.senate_ptr_transaction, ADR 0026), in the same columns as stg_house_ptr_transactions so the
-- mart can stack the two chambers. eFD spells owners and transaction types out; they are written
-- here as the House codes for the same legal categories (Joint -> JT, Sale (Partial) ->
-- S (partial)), so one set of seeds labels both. A value with no House code is kept as printed,
-- and the mart flags it. The asset type stays as eFD prints it ("Stock", "Corporate Bond") and is
-- labelled by the efd_asset_types seed. eFD has no notification date, so it is null. The details
-- eFD prints under a bond or an option (coupon, maturity, strike) become the description.
with rows as (
    select
        t.*,
        t.payload ->> 'amount' as amount_text
    from {{ source('raw', 'senate_ptr_transaction') }} as t
),

parsed as (
    select
        r.*,
        regexp_match(r.amount_text, '^\$([0-9,]+) - \$([0-9,]+)$') as amount_range,
        regexp_match(r.amount_text, '^(?:Spouse/DC )?Over \$([0-9,]+)$') as amount_over,
        regexp_match(r.amount_text, '^\$([0-9,]+(?:\.[0-9]{2})?)$') as amount_exact,
        (
            select string_agg(d.key || ': ' || d.value, '; ' order by d.key)
            from jsonb_each_text(r.payload -> 'asset_detail') as d
        ) as asset_detail_text
    from rows as r
)

select
    p.report_id,
    p.row_number,
    p.bioguide_id,
    case p.payload ->> 'owner'
        when 'Self' then 'SELF'
        when 'Spouse' then 'SP'
        when 'Joint' then 'JT'
        when 'Child' then 'DC'
        when 'Dependent Child' then 'DC'
        else p.payload ->> 'owner'
    end as owner_code,
    p.payload ->> 'asset_type' as asset_type_code,
    p.payload ->> 'ticker' as ticker,
    p.payload ->> 'asset_name' as asset_name,
    case p.payload ->> 'type'
        when 'Purchase' then 'P'
        when 'Sale (Full)' then 'S'
        when 'Sale (Partial)' then 'S (partial)'
        when 'Exchange' then 'E'
        else p.payload ->> 'type'
    end as transaction_type_code,
    to_date(p.payload ->> 'transaction_date', 'MM/DD/YYYY') as trade_date,
    null::date as notification_date,
    p.amount_text as amount_raw,
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
    nullif(p.asset_detail_text, '') as description,
    p.payload ->> 'comment' as comments,
    p.source_url,
    p.fetched_at
from parsed as p
