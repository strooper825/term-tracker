-- One row per traded ticker the SEC lists (raw.sec_company, ADR 0032): the company, its CIK and
-- its Standard Industrial Classification code. `ticker` is normalised as the ingest wrote it
-- (upper case, "-" for a class separator), the form stock_trade joins on. `sic` is null for a
-- filer the SEC gives no industry (a fund, a trust).
select
    ticker,
    cik,
    company,
    sic::int as sic,
    sic_description,
    source_url,
    fetched_at
from {{ source('raw', 'sec_company') }}
