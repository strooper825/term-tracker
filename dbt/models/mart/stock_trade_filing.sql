-- One row per House Periodic Transaction Report a tracked member has filed since the tracked
-- Congress began (ADR 0018), whatever reading its PDF gave: `parsed` (its trades are in
-- mart.stock_trade), `scanned` (a paper form photographed to an image: no text layer, so no
-- trades can be read without OCR) or `failed` (text but no whole table, `error` says why).
-- `source_url` is the PDF on the Clerk site.
select
    f.doc_id,
    f.bioguide_id,
    f.year,
    f.filing_date,
    f.status,
    f.error,
    f.pages,
    coalesce(t.trades, 0)::int as trades,
    'house_clerk_ptr' as source,
    f.pdf_url as source_url,
    f.fetched_at
from {{ ref('stg_house_ptr_filings') }} as f
inner join {{ ref('member') }} as m on m.bioguide_id = f.bioguide_id
left join (
    select doc_id, count(*) as trades
    from {{ ref('stg_house_ptr_transactions') }}
    group by 1
) as t on t.doc_id = f.doc_id
