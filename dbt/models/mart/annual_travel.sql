-- One row per privately paid trip on the report that stands for each member's year
-- (annual_report_version), in the report's order. Senate Part 6 (ADR 0030) and House Schedule H
-- (ADR 0031). The House prints no traveler, travel type or what was paid for, but does print the
-- days spent at the member's own expense (`days_at_own_expense`, null for the Senate).
with lines as (
    select
        source, doc_id, bioguide_id, row_index, departed, returned, travelers, travel_type,
        itinerary, reimbursed_for, sponsor, sponsor_location, days_at_own_expense, comments
    from {{ ref('stg_annual_report_travel') }}
    union all
    select
        source, doc_id, bioguide_id, row_index, departed, returned, travelers, travel_type,
        itinerary, reimbursed_for, sponsor, sponsor_location, days_at_own_expense, comments
    from {{ ref('stg_house_annual_travel') }}
)

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
    t.days_at_own_expense,
    t.comments,
    v.source,
    v.source_url
from {{ ref('annual_report_version') }} as v
inner join lines as t on t.source = v.source and t.doc_id = v.doc_id
