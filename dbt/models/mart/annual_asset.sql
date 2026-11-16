-- One row per asset line of the report that stands for each member's year (annual_report_version),
-- both chambers: Senate Part 3 (ADR 0028) and House Schedule A (ADR 0029), in the report's order.
-- `is_account` marks a Senate line that holds other lines (a brokerage account, a retirement
-- plan): its holdings carry the values, so it counts in no total. The House prints no such line;
-- each holding names its account instead. `held_in` is that account for either chamber.
-- `asset_category` is eFD's type in words, or for the House the label of the Clerk's code
-- (ptr_asset_types). `counts_in_total` is a line whose value is a band, an exact figure, "None"
-- or a top band. `source_url` is the report.
with lines as (
    select
        source, doc_id, bioguide_id, row_index, row_label, parent_label, held_in, asset_name,
        asset_code, asset_notes, asset_category, asset_subtype, owner_code, value_raw,
        value_kind, value_low, value_high, income_type, income_raw
    from {{ ref('stg_annual_report_assets') }}
    union all
    select
        source, doc_id, bioguide_id, row_index, row_label, parent_label, held_in, asset_name,
        asset_code, asset_notes, asset_category, asset_subtype, owner_code, value_raw,
        value_kind, value_low, value_high, income_type, income_raw
    from {{ ref('stg_house_annual_assets') }}
)

select
    v.bioguide_id,
    v.covers_year,
    v.doc_id,
    a.row_index,
    a.row_label,
    a.parent_label,
    exists (
        select 1 from lines as child
        where child.source = a.source and child.doc_id = a.doc_id and child.parent_label = a.row_label
    ) as is_account,
    coalesce(a.held_in, parent.asset_name) as held_in,
    a.asset_name,
    a.asset_notes,
    coalesce(a.asset_category, t.label, a.asset_code) as asset_category,
    a.asset_subtype,
    a.asset_code,
    a.owner_code,
    coalesce(o.label, a.owner_code) as owner_label,
    a.value_raw,
    a.value_kind,
    a.value_low,
    a.value_high,
    a.value_kind in ('band', 'none', 'top_band', 'exact') as counts_in_total,
    a.income_type,
    a.income_raw,
    v.source,
    v.source_url
from {{ ref('annual_report_version') }} as v
inner join lines as a on a.source = v.source and a.doc_id = v.doc_id
left join lines as parent
    on parent.source = a.source and parent.doc_id = a.doc_id and parent.row_label = a.parent_label
left join {{ ref('ptr_owner_codes') }} as o on o.code = a.owner_code
left join {{ ref('ptr_asset_types') }} as t on t.code = a.asset_code
