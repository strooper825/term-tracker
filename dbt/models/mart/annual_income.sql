-- One row per earned or non-investment income line (salary, pension, royalties, board fees) of
-- the report that stands for each member's year (annual_report_version), in the report's order.
-- Senate Part 2 (ADR 0030) and House Schedule C (ADR 0031). Investment income sits on the asset
-- lines (annual_asset). The amount is `exact` (to the cent), `over` a threshold (Senate
-- "> $1,000", how a spouse's income is reported) or `not_stated` (House "N/A", a source listed
-- without its amount); never summed. The House prints no owner, so `owner_code` is null there.
-- `amount_period` is set for a House new member's report, which has two amount columns.
with lines as (
    select
        source, doc_id, bioguide_id, row_index, owner_code, income_type, income_detail, payer,
        payer_location, amount_raw, amount_kind, amount_low, amount_high, amount_period, comments
    from {{ ref('stg_annual_report_income') }}
    union all
    select
        source, doc_id, bioguide_id, row_index, owner_code, income_type, income_detail, payer,
        payer_location, amount_raw, amount_kind, amount_low, amount_high, amount_period, comments
    from {{ ref('stg_house_annual_income') }}
)

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
    i.amount_period,
    i.comments,
    v.source,
    v.source_url
from {{ ref('annual_report_version') }} as v
inner join lines as i on i.source = v.source and i.doc_id = v.doc_id
left join {{ ref('ptr_owner_codes') }} as o on o.code = i.owner_code
