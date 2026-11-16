{{ config(severity='warn') }}
-- A trade dated after the day its report was filed, or a notification dated before the trade, is
-- a typo in the filing or a misread cell (ADR 0018). Named for a person to check against the PDF
-- at source_url; not a failure, because a member can mistype a date and the Clerk publishes it.
select bioguide_id, doc_id, row_number, trade_date, notification_date, filing_date, source_url
from {{ ref('stock_trade') }}
where trade_date > filing_date
   or notification_date < trade_date
