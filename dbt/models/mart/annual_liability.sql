-- One row per liability of the report that stands for each member's year (annual_report_version,
-- ADR 0028), in the report's order. The amount is a band, or a top band with no upper end.
select
    v.bioguide_id,
    v.covers_year,
    v.doc_id,
    l.row_index,
    l.incurred,
    l.owner_code,
    coalesce(o.label, l.owner_code) as owner_label,
    l.liability_type,
    l.rate,
    l.amount_raw,
    l.amount_kind,
    l.amount_low,
    l.amount_high,
    l.creditor,
    l.comments,
    v.source,
    v.source_url
from {{ ref('annual_report_version') }} as v
inner join {{ ref('stg_annual_report_liabilities') }} as l on l.source = v.source and l.doc_id = v.doc_id
left join {{ ref('ptr_owner_codes') }} as o on o.code = l.owner_code
