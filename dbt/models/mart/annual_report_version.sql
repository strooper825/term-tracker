-- The report that stands for each member's year: of the annual, new member and amended reports a member
-- filed for one calendar year and this site read (ADR 0028), the one with the highest amendment
-- number, then the latest filed. An amendment restates the report in full, so its figures replace
-- the original's. One row per (member, source, year).
-- `sections_read`: the report's income, positions, agreements, gifts and travel were read
-- (ADR 0030, ADR 0031). Every eFD report is; a House report only by reader 2 or later, so a
-- report not yet read again after the reader change is never shown as having none.
select distinct on (d.bioguide_id, d.source, d.covers_year)
    d.bioguide_id,
    d.source,
    d.covers_year,
    d.doc_id,
    d.kind,
    d.amendment,
    d.filing_date,
    d.source_url,
    d.source = 'senate_efd' or coalesce((p.payload ->> 'reader')::int, 1) >= 2 as sections_read
from {{ ref('stg_annual_disclosures') }} as d
inner join {{ source('raw', 'annual_report_page') }} as p
    on p.source = d.source and p.doc_id = d.doc_id
inner join {{ ref('member') }} as m on m.bioguide_id = d.bioguide_id
where p.status = 'parsed'
  and d.kind in ('annual', 'amendment', 'new_filer')
  and d.covers_year is not null
order by d.bioguide_id, d.source, d.covers_year, coalesce(d.amendment, 0) desc, d.filing_date desc, d.doc_id desc
