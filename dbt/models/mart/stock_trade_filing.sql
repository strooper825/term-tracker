-- One row per Periodic Transaction Report a tracked member has filed since the tracked Congress
-- began, whatever reading it gave: `parsed` (its trades are in mart.stock_trade), `scanned` (a
-- paper form: a House PDF with no text layer, or a Senate report filed as page images, so no
-- trades can be read without OCR) or `failed` (the table did not read back whole, `error` says
-- why). House reports come from the Clerk (ADR 0018), Senate reports from eFD (ADR 0026).
-- `amendment` is the Senate's amendment number (0 for an original, null for the House, whose
-- index does not say). `superseded_by` is the Senate amendment that replaced the report: it stays
-- listed, but `trades` counts 0 and its trades are not in mart.stock_trade. `source_url` is the
-- House PDF or the eFD report page.
with house as (
    select
        f.doc_id,
        f.bioguide_id,
        f.year,
        f.filing_date,
        f.status,
        f.error,
        f.pages,
        null::int as amendment,
        null::text as superseded_by,
        coalesce(t.trades, 0)::int as trades,
        'house_clerk_ptr' as source,
        f.pdf_url as source_url,
        f.fetched_at
    from {{ ref('stg_house_ptr_filings') }} as f
    left join (
        select doc_id, count(*) as trades
        from {{ ref('stg_house_ptr_transactions') }}
        group by 1
    ) as t on t.doc_id = f.doc_id
),

replaced as (
    select supersedes as report_id, min(report_id) as superseded_by
    from {{ ref('stg_senate_ptr_reports') }}
    where supersedes is not null
    group by 1
),

senate as (
    select
        r.report_id as doc_id,
        r.bioguide_id,
        extract(year from r.filing_date)::int as year,
        r.filing_date,
        case r.status when 'paper' then 'scanned' else r.status end as status,
        r.error,
        r.pages,
        r.amendment,
        x.superseded_by,
        case when x.superseded_by is null then coalesce(t.trades, 0) else 0 end::int as trades,
        'senate_efd' as source,
        r.source_url,
        r.fetched_at
    from {{ ref('stg_senate_ptr_reports') }} as r
    left join replaced as x on x.report_id = r.report_id
    left join (
        select report_id, count(*) as trades
        from {{ ref('stg_senate_ptr_transactions') }}
        group by 1
    ) as t on t.report_id = r.report_id
)

select f.*
from (
    select * from house
    union all
    select * from senate
) as f
inner join {{ ref('member') }} as m on m.bioguide_id = f.bioguide_id
