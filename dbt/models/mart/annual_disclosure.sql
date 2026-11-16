-- One row per annual-disclosure report a tracked member has filed since the tracked Congress
-- began, both chambers, listed and linked (ADR 0027), plus one row per annual report that an
-- extension has delayed and that is not filed yet. Nothing inside a report is read.
--
-- Extensions are not listed on their own: each is a note on the report it delays.
--   * eFD names the report ("Annual Report for 2025 Due Date Extension 1").
--   * The Clerk's index does not. Annual reports are due on May 15 of the following year, so a
--     House extension filed in the year after the one it is listed under is taken to be for that
--     year's annual report; one filed in the covered year itself is not shown.
-- `extended_on` is the latest such extension filed on or before the annual or new member report
-- for that year. A row with `kind = 'extension'` is a report due after an extension and not
-- filed yet; its link is the extension. A House amendment may amend an annual or a new member
-- report (the index does not say which), so it is labelled "Amended report"; eFD's amendments
-- here are of annual reports.
with filings as (
    select * from {{ ref('stg_annual_disclosures') }}
),

extensions as (
    select bioguide_id, source, covers_year, filing_date, doc_id, source_url, fetched_at
    from filings
    where kind = 'extension'
      and covers_year is not null
      and (source = 'senate_efd' or extract(year from filing_date)::int = covers_year + 1)
),

reports as (
    select
        f.*,
        (
            select max(e.filing_date)
            from extensions as e
            where e.bioguide_id = f.bioguide_id
              and e.source = f.source
              and e.covers_year = f.covers_year
              and e.filing_date <= f.filing_date
        ) as extended_on
    from filings as f
    where f.kind <> 'extension'
),

pending as (
    select distinct on (e.bioguide_id, e.source, e.covers_year)
        e.source,
        e.doc_id,
        e.bioguide_id,
        'extension' as kind,
        e.covers_year,
        e.filing_date,
        null::int as amendment,
        e.filing_date as extended_on,
        e.source_url,
        e.fetched_at
    from extensions as e
    where not exists (
        select 1 from reports as r
        where r.bioguide_id = e.bioguide_id
          and r.source = e.source
          and r.covers_year = e.covers_year
          and r.kind in ('annual', 'new_filer')
    )
    order by e.bioguide_id, e.source, e.covers_year, e.filing_date desc
),

listed as (
    select
        source, doc_id, bioguide_id, kind, covers_year, filing_date, amendment,
        case when kind in ('annual', 'new_filer') then extended_on end as extended_on,
        source_url, fetched_at
    from reports
    union all
    select
        source, doc_id, bioguide_id, kind, covers_year, filing_date, amendment, extended_on,
        source_url, fetched_at
    from pending
)

select
    l.bioguide_id,
    l.doc_id,
    l.source,
    l.kind,
    l.covers_year,
    l.filing_date,
    l.amendment,
    l.extended_on,
    case l.kind
        when 'annual' then 'Annual report' || coalesce(' for ' || l.covers_year, '')
        when 'amendment' then
            case when l.source = 'house_clerk' then 'Amended report' else 'Amended annual report' end
            || coalesce(' for ' || l.covers_year, '')
            || case when l.amendment > 1 then ' (amendment ' || l.amendment || ')' else '' end
        when 'new_filer' then 'New member report' || coalesce(' for ' || l.covers_year, '')
        when 'termination' then 'Termination report'
        when 'extension' then 'Report for ' || l.covers_year || ': not filed yet'
    end as label,
    l.source_url,
    l.fetched_at
from listed as l
inner join {{ ref('member') }} as m on m.bioguide_id = l.bioguide_id
