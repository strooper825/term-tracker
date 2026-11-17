-- One row per outside position (director, trustee, partner, LLC member) of the report that
-- stands for each member's year (annual_report_version), in the report's order. Senate Part 8
-- (ADR 0030) and House Schedule E (ADR 0031). The House prints no dates, location or entity
-- type, so those are null there and `is_current` is unknown (null).
with lines as (
    select
        source, doc_id, bioguide_id, row_index, position_dates, is_current, position_held, entity,
        entity_location, entity_type, comments
    from {{ ref('stg_annual_report_positions') }}
    union all
    select
        source, doc_id, bioguide_id, row_index, position_dates, is_current, position_held, entity,
        entity_location, entity_type, comments
    from {{ ref('stg_house_annual_positions') }}
)

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
inner join lines as p on p.source = v.source and p.doc_id = v.doc_id
