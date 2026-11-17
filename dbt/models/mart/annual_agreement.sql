-- One row per agreement or arrangement (royalties, a pension plan, future employment, a leave of
-- absence) of the report that stands for each member's year (annual_report_version), in the
-- report's order. Senate Part 9 only for now (ADR 0030); House Schedule F is not read yet.
select
    v.bioguide_id,
    v.covers_year,
    v.doc_id,
    a.row_index,
    a.agreement_date,
    a.parties,
    a.parties_location,
    a.agreement_type,
    a.terms,
    a.comments,
    v.source,
    v.source_url
from {{ ref('annual_report_version') }} as v
inner join {{ ref('stg_annual_report_agreements') }} as a on a.source = v.source and a.doc_id = v.doc_id
