-- The counts on the Stock trades tab equal the rows beside them (ADR 0018): a parsed filing has
-- at least one trade, a scanned or failed one has none, and each member's trade and filing
-- counts equal what mart.stock_trade and mart.stock_trade_filing hold.
select 'filing status and trades disagree' as problem, doc_id as detail
from {{ ref('stock_trade_filing') }}
where (status = 'parsed' and trades = 0) or (status <> 'parsed' and trades > 0)

union all

select 'trade count differs from mart.stock_trade', s.bioguide_id
from {{ ref('member_stock_trades') }} as s
where s.trades <> (select count(*) from {{ ref('stock_trade') }} as t where t.bioguide_id = s.bioguide_id)

union all

select 'filing counts differ from mart.stock_trade_filing', s.bioguide_id
from {{ ref('member_stock_trades') }} as s
where s.filings <> (select count(*) from {{ ref('stock_trade_filing') }} as f where f.bioguide_id = s.bioguide_id)
   or s.filings <> s.filings_parsed + s.filings_scanned + s.filings_failed
   or s.trades <> s.purchases + s.sales + s.exchanges + (
       select count(*) from {{ ref('stock_trade') }} as t
       where t.bioguide_id = s.bioguide_id and t.direction = 'other'
   )

union all

select 'a senator has PTR rows', s.bioguide_id
from {{ ref('member_stock_trades') }} as s
where s.chamber = 'senate' and (s.filings > 0 or s.trades > 0)
