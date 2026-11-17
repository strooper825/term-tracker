-- One row per transaction on a Periodic Transaction Report of a tracked member, the trade list of
-- the Stock trades tab: House reports from the Clerk's PDFs (ADR 0018) and Senate reports from eFD
-- (ADR 0026). Codes are mapped with the ptr_* seeds (the Senate's spelled-out owners and types are
-- written as the House codes in staging) and the Senate's asset types with efd_asset_types; a
-- value no seed maps is kept, its label falls back to the raw value, and `has_unmapped_code` says
-- so (the warning test assert_stock_trade_codes_mapped counts them). The disclosed amount is a
-- band, usually not a figure: `amount_low` and `amount_high` are the band ends, `amount_high` is
-- null for the top band ("Over $50,000,000"), and `amount_kind` is `exact` (low equal to high)
-- when the filer entered a single figure instead of a band. `days_to_file` is the filing date
-- minus the trade date. `doc_id` is the Clerk's DocID or eFD's report UUID. A Senate report that
-- an amendment replaced keeps its place in mart.stock_trade_filing, but its trades are not here:
-- the amendment's are. `source_url` is the House PDF with #page=N, or the eFD report page.
-- `company`, `sic` and `industry` are the SEC's for the ticker (ADR 0032); null for a trade with no
-- ticker (a bond, a fund) or a ticker the SEC does not list.
with house as (
    select
        t.bioguide_id,
        t.doc_id,
        t.row_number,
        f.filing_date,
        t.trade_date,
        t.notification_date,
        t.owner_code,
        t.asset_name,
        t.ticker,
        t.asset_type_code,
        a.label as asset_type_label,
        a.code is not null as asset_type_mapped,
        t.transaction_type_code,
        t.amount_raw,
        t.amount_kind,
        t.amount_low,
        t.amount_high,
        t.filing_status,
        t.subholding_of,
        t.description,
        t.location,
        t.comments,
        'house_clerk_ptr' as source,
        t.source_url,
        t.fetched_at
    from {{ ref('stg_house_ptr_transactions') }} as t
    inner join {{ ref('stg_house_ptr_filings') }} as f on f.doc_id = t.doc_id
    left join {{ ref('ptr_asset_types') }} as a on a.code = t.asset_type_code
),

senate_replaced as (
    select distinct supersedes as report_id
    from {{ ref('stg_senate_ptr_reports') }}
    where supersedes is not null
),

senate as (
    select
        t.bioguide_id,
        t.report_id as doc_id,
        t.row_number,
        r.filing_date,
        t.trade_date,
        t.notification_date,
        t.owner_code,
        t.asset_name,
        t.ticker,
        t.asset_type_code,
        a.label as asset_type_label,
        a.code is not null as asset_type_mapped,
        t.transaction_type_code,
        t.amount_raw,
        t.amount_kind,
        t.amount_low,
        t.amount_high,
        null::text as filing_status,
        null::text as subholding_of,
        t.description,
        null::text as location,
        t.comments,
        'senate_efd' as source,
        t.source_url,
        t.fetched_at
    from {{ ref('stg_senate_ptr_transactions') }} as t
    inner join {{ ref('stg_senate_ptr_reports') }} as r on r.report_id = t.report_id
    left join {{ ref('efd_asset_types') }} as a on a.code = t.asset_type_code
    where t.report_id not in (select report_id from senate_replaced)
),

both_chambers as (
    select * from house
    union all
    select * from senate
)

select
    t.bioguide_id,
    t.doc_id,
    t.row_number,
    t.filing_date,
    t.trade_date,
    t.notification_date,
    (t.filing_date - t.trade_date) as days_to_file,
    t.owner_code,
    coalesce(o.label, t.owner_code) as owner_label,
    t.asset_name,
    t.ticker,
    t.asset_type_code,
    coalesce(t.asset_type_label, t.asset_type_code) as asset_type_label,
    t.transaction_type_code,
    coalesce(tt.label, t.transaction_type_code) as transaction_type_label,
    coalesce(tt.direction, 'other') as direction,
    t.amount_raw,
    t.amount_kind,
    t.amount_low,
    t.amount_high,
    t.filing_status,
    t.subholding_of,
    t.description,
    t.location,
    t.comments,
    sec.company,
    sec.sic,
    sec.sic_description as industry,
    (o.code is null or not t.asset_type_mapped or tt.code is null) as has_unmapped_code,
    t.source,
    t.source_url,
    t.fetched_at
from both_chambers as t
inner join {{ ref('member') }} as m on m.bioguide_id = t.bioguide_id
left join {{ ref('ptr_owner_codes') }} as o on o.code = t.owner_code
left join {{ ref('ptr_transaction_types') }} as tt on tt.code = t.transaction_type_code
left join {{ ref('stg_sec_companies') }} as sec
    on sec.ticker = upper(regexp_replace(t.ticker, '[./]', '-', 'g'))
