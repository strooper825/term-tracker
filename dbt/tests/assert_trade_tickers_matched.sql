{{ config(severity='warn') }}
-- A ticker on a tracked member's trade that has no SEC company (ADR 0032): the SEC does not list
-- it (a misprinted ticker, a renamed or delisted company, a foreign share), or the nightly has not
-- looked it up yet. Its trades get no industry and never an overlap note. Listed for a person to
-- check; most need nothing.
select upper(regexp_replace(t.ticker, '[./]', '-', 'g')) as ticker, count(*) as trades,
       min(t.asset_name) as asset_name
from {{ ref('stock_trade') }} as t
where t.ticker is not null
  and t.company is null
group by 1
