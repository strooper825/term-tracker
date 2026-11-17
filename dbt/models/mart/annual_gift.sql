-- One row per gift reported on the report that stands for each member's year
-- (annual_report_version), in the report's order. Senate Part 5 only for now (ADR 0030); House
-- Schedule G is not read yet. Only gifts over the reporting threshold are listed by the filer.
select
    v.bioguide_id,
    v.covers_year,
    v.doc_id,
    g.row_index,
    g.gift_date,
    g.owner_code,
    coalesce(o.label, g.owner_code) as owner_label,
    g.gift,
    g.value_raw,
    g.value,
    g.giver,
    g.giver_location,
    g.comments,
    v.source,
    v.source_url
from {{ ref('annual_report_version') }} as v
inner join {{ ref('stg_annual_report_gifts') }} as g on g.source = v.source and g.doc_id = v.doc_id
left join {{ ref('ptr_owner_codes') }} as o on o.code = g.owner_code
