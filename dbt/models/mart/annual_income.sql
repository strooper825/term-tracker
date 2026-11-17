-- One row per earned or non-investment income line (salary, pension, royalties, board fees) of
-- the report that stands for each member's year (annual_report_version), in the report's order.
-- Senate Part 2 only for now (ADR 0030); House Schedule C is not read yet. Investment income
-- sits on the asset lines (annual_asset). The amount is `exact` (to the cent) or `over` a
-- threshold ("> $1,000", how a spouse's income is reported), never summed.
select
    v.bioguide_id,
    v.covers_year,
    v.doc_id,
    i.row_index,
    i.owner_code,
    coalesce(o.label, i.owner_code) as owner_label,
    i.income_type,
    i.income_detail,
    i.payer,
    i.payer_location,
    i.amount_raw,
    i.amount_kind,
    i.amount_low,
    i.amount_high,
    i.comments,
    v.source,
    v.source_url
from {{ ref('annual_report_version') }} as v
inner join {{ ref('stg_annual_report_income') }} as i on i.source = v.source and i.doc_id = v.doc_id
left join {{ ref('ptr_owner_codes') }} as o on o.code = i.owner_code
