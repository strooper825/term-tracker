-- One row per liability of the report that stands for each member's year (annual_report_version),
-- both chambers: Senate Part 7 (ADR 0028) and House Schedule D (ADR 0029), in the report's order.
-- The amount is a band, an exact figure, or a top band with no upper end.
with lines as (
    select
        source, doc_id, bioguide_id, row_index, incurred, owner_code, liability_type, rate,
        amount_raw, amount_kind, amount_low, amount_high, creditor, comments
    from {{ ref('stg_annual_report_liabilities') }}
    union all
    select
        source, doc_id, bioguide_id, row_index, incurred, owner_code, liability_type, rate,
        amount_raw, amount_kind, amount_low, amount_high, creditor, comments
    from {{ ref('stg_house_annual_liabilities') }}
)

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
inner join lines as l on l.source = v.source and l.doc_id = v.doc_id
left join {{ ref('ptr_owner_codes') }} as o on o.code = l.owner_code
