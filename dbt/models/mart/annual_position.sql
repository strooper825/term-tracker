-- One row per outside position (director, trustee, partner, LLC member) of the report that
-- stands for each member's year (annual_report_version), in the report's order. Senate Part 8
-- only for now (ADR 0030); House Schedule E is not read yet.
select
    v.bioguide_id,
    v.covers_year,
    v.doc_id,
    p.row_index,
    p.position_dates,
    p.is_current,
    p.position_held,
    p.entity,
    p.entity_location,
    p.entity_type,
    p.comments,
    v.source,
    v.source_url
from {{ ref('annual_report_version') }} as v
inner join {{ ref('stg_annual_report_positions') }} as p on p.source = v.source and p.doc_id = v.doc_id
