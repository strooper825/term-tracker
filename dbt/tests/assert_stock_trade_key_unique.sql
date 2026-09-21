-- One row per (filing, row number) in mart.stock_trade (ADR 0018).
select doc_id, row_number, count(*) as n
from {{ ref('stock_trade') }}
group by 1, 2
having count(*) > 1
