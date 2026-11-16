-- One row per line of Part 3 (Assets) of a read Senate annual report (raw.annual_report_row,
-- ADR 0028),
-- typed from the cells eFD prints: #, asset (with nested notes such as a filer's comment), asset
-- type (with its subtype as a note), owner, value, income type, income.
-- `row_label` is eFD's numbering: "1" is a line, "1.1" a holding inside line 1 (an account, a
-- retirement plan); `parent_label` is "1" for "1.1". Owners are written as the House codes for
-- the same categories, as the PTR staging does. The value is a band ($15,001 - $50,000), `none`
-- ("None (or less than $1,001)": 0 to 1,000), a top band with no upper end ("Over $50,000,000"),
-- `not_valued` ("--", an account whose holdings carry the values) or `unascertainable`; anything
-- else is `other` and kept as printed.
with rows as (
    select
        r.source,
        r.doc_id,
        r.bioguide_id,
        r.row_index,
        r.payload -> 'cells' as c
    from {{ source('raw', 'annual_report_row') }} as r
    where r.source = 'senate_efd' and r.part = '3'
),

typed as (
    select
        rows.*,
        c -> 0 ->> 'text' as row_label,
        c -> 4 ->> 'text' as value_raw,
        regexp_match(c -> 4 ->> 'text', '^\$([0-9,]+) - \$([0-9,]+)$') as value_band,
        regexp_match(c -> 4 ->> 'text', '^None \(or less than \$([0-9,]+)\)$') as value_none,
        regexp_match(c -> 4 ->> 'text', '^(?:Spouse/DC )?Over \$([0-9,]+)$') as value_over
    from rows
)

select
    t.source,
    t.doc_id,
    t.bioguide_id,
    t.row_index,
    t.row_label,
    case when position('.' in t.row_label) > 0 then split_part(t.row_label, '.', 1) end as parent_label,
    null::text as held_in,  -- the mart fills it from the parent line's name
    t.c -> 1 ->> 'text' as asset_name,
    null::text as asset_code,  -- eFD prints the type in words
    nullif(array_to_string(array(select jsonb_array_elements_text(t.c -> 1 -> 'notes')), '; '), '') as asset_notes,
    t.c -> 2 ->> 'text' as asset_category,
    t.c -> 2 -> 'notes' ->> 0 as asset_subtype,
    case t.c -> 3 ->> 'text'
        when 'Self' then 'SELF'
        when 'Spouse' then 'SP'
        when 'Joint' then 'JT'
        when 'Child' then 'DC'
        when 'Dependent Child' then 'DC'
        else t.c -> 3 ->> 'text'
    end as owner_code,
    t.value_raw,
    case
        when t.value_band is not null then 'band'
        when t.value_none is not null then 'none'
        when t.value_over is not null then 'top_band'
        when t.value_raw = '--' then 'not_valued'
        when t.value_raw = 'Unascertainable' then 'unascertainable'
        else 'other'
    end as value_kind,
    case
        when t.value_band is not null then replace(t.value_band[1], ',', '')::numeric(16, 2)
        when t.value_none is not null then 0
        when t.value_over is not null then replace(t.value_over[1], ',', '')::numeric(16, 2)
    end as value_low,
    case
        when t.value_band is not null then replace(t.value_band[2], ',', '')::numeric(16, 2)
        when t.value_none is not null then replace(t.value_none[1], ',', '')::numeric(16, 2) - 1
    end as value_high,
    nullif(t.c -> 5 ->> 'text', '') as income_type,
    nullif(t.c -> 6 ->> 'text', '') as income_raw
from typed as t
