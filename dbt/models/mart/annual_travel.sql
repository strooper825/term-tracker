-- One row per privately paid trip on the report that stands for each member's year
-- (annual_report_version), in the report's order. Senate Part 6 only for now (ADR 0030); House
-- Schedule H is not read yet.
select
    v.bioguide_id,
    v.covers_year,
    v.doc_id,
    t.row_index,
    t.departed,
    t.returned,
    t.travelers,
    t.travel_type,
    t.itinerary,
    t.reimbursed_for,
    t.sponsor,
    t.sponsor_location,
    t.comments,
    v.source,
    v.source_url
from {{ ref('annual_report_version') }} as v
inner join {{ ref('stg_annual_report_travel') }} as t on t.source = v.source and t.doc_id = v.doc_id
