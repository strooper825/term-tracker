{{ config(severity='warn') }}
-- Filings whose PDF has a text layer but did not read back as whole rows (ADR 0018). The site
-- shows them as unread with a link to the PDF; this names each one, with the reason, for review.
-- Scanned paper filings are expected and are not listed here.
select doc_id, bioguide_id, year, filing_date, error, source_url
from {{ ref('stock_trade_filing') }}
where status = 'failed'
