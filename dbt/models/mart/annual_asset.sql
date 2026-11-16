-- One row per asset line of the report that stands for each member's year (annual_report_version,
-- ADR 0028), in the report's order. `is_account` marks a line that holds other lines (a
-- brokerage account, a retirement plan): its holdings carry the values, so it counts in no total.
-- `counts_in_total` is a line whose value is a band, "None (or less than $1,001)" or a top band.
-- `source_url` is the report on eFD.
select
    v.bioguide_id,
    v.covers_year,
    v.doc_id,
    a.row_index,
    a.row_label,
    a.parent_label,
    exists (
        select 1 from {{ ref('stg_annual_report_assets') }} as child
        where child.source = a.source and child.doc_id = a.doc_id and child.parent_label = a.row_label
    ) as is_account,
    a.asset_name,
    a.asset_notes,
    a.asset_category,
    a.asset_subtype,
    a.owner_code,
    coalesce(o.label, a.owner_code) as owner_label,
    a.value_raw,
    a.value_kind,
    a.value_low,
    a.value_high,
    a.value_kind in ('band', 'none', 'top_band') as counts_in_total,
    a.income_type,
    a.income_raw,
    v.source,
    v.source_url
from {{ ref('annual_report_version') }} as v
inner join {{ ref('stg_annual_report_assets') }} as a on a.source = v.source and a.doc_id = v.doc_id
left join {{ ref('ptr_owner_codes') }} as o on o.code = a.owner_code
