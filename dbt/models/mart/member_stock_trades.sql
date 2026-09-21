-- One row per tracked member: what the Stock trades tab says (ADR 0018).
--   senate_unavailable  a senator: the Senate eFD system blocks automated access, so no trades
--                       are ingested and the tab says so
--   no_filings          a House member the Clerk index lists no PTR for since the Congress began
--   filed               a House member with at least one PTR; `filings_scanned` counts paper forms
--                       whose trades cannot be read, `filings_failed` those that did not parse
-- Every figure the tab shows is a column here. The value totals add the ends of each trade
-- disclosed band, so `*_low` is the least the trades could have been worth and `*_high` the most;
-- `*_high_is_open` says a top-band trade ("Over $50,000,000") has no upper end, which makes the
-- high total a floor for the high end, not a ceiling. `lookup_url` is the official search for
-- checking the tab against the source. `checked_at` is the last successful ingest.
with latest_term as (
    select distinct on (bioguide_id) bioguide_id, chamber
    from {{ ref('term') }}
    order by bioguide_id, start_date desc
),

filings as (
    select
        bioguide_id,
        count(*)::int as filings,
        count(*) filter (where status = 'parsed')::int as filings_parsed,
        count(*) filter (where status = 'scanned')::int as filings_scanned,
        count(*) filter (where status = 'failed')::int as filings_failed,
        max(filing_date) as latest_filing_date,
        max(fetched_at) as fetched_at
    from {{ ref('stock_trade_filing') }}
    group by 1
),

trades as (
    select
        bioguide_id,
        count(*)::int as trades,
        count(*) filter (where direction = 'purchase')::int as purchases,
        count(*) filter (where direction = 'sale')::int as sales,
        count(*) filter (where direction = 'exchange')::int as exchanges,
        coalesce(sum(amount_low) filter (where direction = 'purchase'), 0) as purchases_low,
        coalesce(sum(amount_high) filter (where direction = 'purchase'), 0) as purchases_high,
        coalesce(bool_or(amount_high is null) filter (where direction = 'purchase'), false) as purchases_high_is_open,
        coalesce(sum(amount_low) filter (where direction = 'sale'), 0) as sales_low,
        coalesce(sum(amount_high) filter (where direction = 'sale'), 0) as sales_high,
        coalesce(bool_or(amount_high is null) filter (where direction = 'sale'), false) as sales_high_is_open,
        min(trade_date) as first_trade_date,
        max(trade_date) as last_trade_date
    from {{ ref('stock_trade') }}
    group by 1
),

checked as (
    select max(finished_at) as at
    from {{ source('meta', 'ingest_run') }}
    where source = 'house_ptr' and status = 'success'
)

select
    m.bioguide_id,
    lt.chamber,
    case
        when lt.chamber = 'senate' then 'senate_unavailable'
        when coalesce(f.filings, 0) = 0 then 'no_filings'
        else 'filed'
    end as status,
    coalesce(f.filings, 0) as filings,
    coalesce(f.filings_parsed, 0) as filings_parsed,
    coalesce(f.filings_scanned, 0) as filings_scanned,
    coalesce(f.filings_failed, 0) as filings_failed,
    f.latest_filing_date,
    coalesce(t.trades, 0) as trades,
    coalesce(t.purchases, 0) as purchases,
    coalesce(t.sales, 0) as sales,
    coalesce(t.exchanges, 0) as exchanges,
    coalesce(t.purchases_low, 0) as purchases_low,
    coalesce(t.purchases_high, 0) as purchases_high,
    coalesce(t.purchases_high_is_open, false) as purchases_high_is_open,
    coalesce(t.sales_low, 0) as sales_low,
    coalesce(t.sales_high, 0) as sales_high,
    coalesce(t.sales_high_is_open, false) as sales_high_is_open,
    t.first_trade_date,
    t.last_trade_date,
    '{{ var("current_congress_start") }}'::date as covers_from,
    case lt.chamber
        when 'senate' then 'https://efdsearch.senate.gov/search/'
        else 'https://disclosures-clerk.house.gov/FinancialDisclosure'
    end as lookup_url,
    case lt.chamber when 'senate' then 'senate_efd' else 'house_clerk_ptr' end as source,
    case lt.chamber
        when 'senate' then 'https://efdsearch.senate.gov/search/'
        else 'https://disclosures-clerk.house.gov/FinancialDisclosure'
    end as source_url,
    coalesce(f.fetched_at, (select at from checked), now()) as fetched_at,
    (select at from checked) as checked_at
from {{ ref('member') }} as m
inner join latest_term as lt on lt.bioguide_id = m.bioguide_id
left join filings as f on f.bioguide_id = m.bioguide_id
left join trades as t on t.bioguide_id = m.bioguide_id
