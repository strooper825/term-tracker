-- One row per gift reported on the report that stands for each member's year
-- (annual_report_version), in the report's order. Senate Part 5 (ADR 0030) and House Schedule G
-- (ADR 0031). Only gifts over the reporting threshold are listed by the filer. The House prints
-- no date or recipient, so those are null there.
with lines as (
    select
        source, doc_id, bioguide_id, row_index, gift_date, owner_code, gift, value_raw, value,
        giver, giver_location, comments
    from {{ ref('stg_annual_report_gifts') }}
    union all
    select
        source, doc_id, bioguide_id, row_index, gift_date, owner_code, gift, value_raw, value,
        giver, giver_location, comments
    from {{ ref('stg_house_annual_gifts') }}
)

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
inner join lines as g on g.source = v.source and g.doc_id = v.doc_id
left join {{ ref('ptr_owner_codes') }} as o on o.code = g.owner_code
