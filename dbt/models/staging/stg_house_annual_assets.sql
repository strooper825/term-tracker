-- One row per line of Schedule A (Assets and "Unearned" Income) of a read House annual report
-- (raw.annual_report_row, part 'A', ADR 0029), in the columns of stg_annual_report_assets so the
-- mart can stack the chambers. The asset cell is "ACCOUNT ⇒ name [XX]" for a holding in an account
-- (`held_in` is the account) or "name [XX]"; XX is the Clerk's asset-type code, labelled in the
-- mart by ptr_asset_types. The House scale has its own "$1 - $1,000" band, so a value of "None"
-- means no value at all (0); "Undetermined" is `unascertainable`; a filer may enter one exact
-- figure ("$209,630.10", `exact`); "Spouse/DC Over $1,000,000" is a top band with no upper end.
-- The detail lines under a row (Description, Location, Comments) become the notes.
with rows as (
    select
        r.source,
        r.doc_id,
        r.bioguide_id,
        r.row_index,
        r.payload -> 'cells' as c,
        r.payload -> 'detail' as d,
        r.payload -> 'cells' ->> 'asset' as asset_text,
        r.payload -> 'cells' ->> 'value' as value_text
    from {{ source('raw', 'annual_report_row') }} as r
    where r.source = 'house_clerk' and r.part = 'A'
),

typed as (
    select
        rows.*,
        case when position('⇒' in asset_text) > 0
            then trim(split_part(asset_text, '⇒', 1)) end as held_in,
        trim(regexp_replace(asset_text, '^.*⇒', '')) as held_asset,
        regexp_match(value_text, '^\$([0-9,]+) - \$([0-9,]+)$') as value_band,
        regexp_match(value_text, '^(?:Spouse/DC )?Over \$([0-9,]+)$') as value_over,
        regexp_match(value_text, '^\$([0-9,]+(?:\.[0-9]{2})?)$') as value_exact
    from rows
)

select
    t.source,
    t.doc_id,
    t.bioguide_id,
    t.row_index,
    t.row_index::text as row_label,
    null::text as parent_label,
    t.held_in,
    trim(regexp_replace(t.held_asset, '\s*\[[A-Z0-9]{2}\]$', '')) as asset_name,
    (regexp_match(t.held_asset, '\[([A-Z0-9]{2})\]$'))[1] as asset_code,
    nullif(concat_ws('; ',
        'Description: ' || (t.d ->> 'description'),
        'Location: ' || (t.d ->> 'location'),
        'Comments: ' || (t.d ->> 'comments'),
        nullif(t.d ->> 'note', '')
    ), '') as asset_notes,
    null::text as asset_category,
    null::text as asset_subtype,
    coalesce(nullif(t.c ->> 'owner', ''), 'SELF') as owner_code,
    t.value_text as value_raw,
    case
        when t.value_band is not null then 'band'
        when t.value_over is not null then 'top_band'
        when t.value_exact is not null then 'exact'
        when t.value_text = 'None' then 'none'
        when t.value_text = 'Undetermined' then 'unascertainable'
        else 'other'
    end as value_kind,
    case
        when t.value_band is not null then replace(t.value_band[1], ',', '')::numeric(16, 2)
        when t.value_over is not null then replace(t.value_over[1], ',', '')::numeric(16, 2)
        when t.value_exact is not null then replace(t.value_exact[1], ',', '')::numeric(16, 2)
        when t.value_text = 'None' then 0
    end as value_low,
    case
        when t.value_band is not null then replace(t.value_band[2], ',', '')::numeric(16, 2)
        when t.value_exact is not null then replace(t.value_exact[1], ',', '')::numeric(16, 2)
        when t.value_text = 'None' then 0
    end as value_high,
    nullif(t.c ->> 'income_type', '') as income_type,
    -- A new member's report has two income columns; the current year to filing is often
    -- "Not Applicable", so the preceding year stands in.
    coalesce(
        nullif(nullif(t.c ->> 'income', ''), 'Not Applicable'),
        nullif(t.c ->> 'income_preceding', ''),
        nullif(t.c ->> 'income', '')
    ) as income_raw
from typed as t
