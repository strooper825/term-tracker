-- One row per agreement or arrangement (royalties, a pension plan, future employment, a leave of
-- absence) of the report that stands for each member's year (annual_report_version), in the
-- report's order. Senate Part 9 (ADR 0030) and House Schedule F (ADR 0031). The House prints no
-- agreement type or location, so those are null there.
with lines as (
    select
        source, doc_id, bioguide_id, row_index, agreement_date, parties, parties_location,
        agreement_type, terms, comments
    from {{ ref('stg_annual_report_agreements') }}
    union all
    select
        source, doc_id, bioguide_id, row_index, agreement_date, parties, parties_location,
        agreement_type, terms, comments
    from {{ ref('stg_house_annual_agreements') }}
)

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
inner join lines as a on a.source = v.source and a.doc_id = v.doc_id
