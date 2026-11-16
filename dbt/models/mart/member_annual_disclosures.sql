-- One row per tracked member: what the annual-disclosure section of the Stock trades tab says
-- (ADR 0027).
--   unavailable  the member's chamber's listing has never been read successfully
--   no_filings   the Clerk index (House) or the eFD search (Senate) lists no annual report,
--                amendment, new member or termination report for the member since the tracked
--                Congress began
--   filed        at least one is listed
-- `latest_year` is the newest year an annual report covers. `checked_at` is the last successful
-- run of the chamber's source (house_annual or senate_annual); `lookup_url` the office's search.
with latest_term as (
    select distinct on (bioguide_id) bioguide_id, chamber
    from {{ ref('term') }}
    order by bioguide_id, start_date desc
),

listed as (
    select
        bioguide_id,
        count(*) filter (where kind <> 'extension')::int as reports,
        count(*) filter (where kind = 'extension')::int as pending,
        max(covers_year) filter (where kind = 'annual') as latest_year,
        max(filing_date) filter (where kind <> 'extension') as latest_filing_date
    from {{ ref('annual_disclosure') }}
    group by 1
),

checked as (
    select
        case source when 'senate_annual' then 'senate' else 'house' end as chamber,
        max(finished_at) as at
    from {{ source('meta', 'ingest_run') }}
    where source in ('house_annual', 'senate_annual') and status = 'success'
    group by 1
)

select
    m.bioguide_id,
    lt.chamber,
    case
        when c.at is null then 'unavailable'
        when coalesce(l.reports, 0) + coalesce(l.pending, 0) = 0 then 'no_filings'
        else 'filed'
    end as status,
    coalesce(l.reports, 0) as reports,
    coalesce(l.pending, 0) as pending,
    l.latest_year,
    l.latest_filing_date,
    {{ congress_start_date() }} as covers_from,
    case lt.chamber
        when 'senate' then 'https://efdsearch.senate.gov/search/'
        else 'https://disclosures-clerk.house.gov/FinancialDisclosure'
    end as lookup_url,
    case lt.chamber when 'senate' then 'senate_efd' else 'house_clerk' end as source,
    case lt.chamber
        when 'senate' then 'https://efdsearch.senate.gov/search/'
        else 'https://disclosures-clerk.house.gov/FinancialDisclosure'
    end as source_url,
    coalesce(c.at, now()) as fetched_at,
    c.at as checked_at
from {{ ref('member') }} as m
inner join latest_term as lt on lt.bioguide_id = m.bioguide_id
left join listed as l on l.bioguide_id = m.bioguide_id
left join checked as c on c.chamber = lt.chamber
