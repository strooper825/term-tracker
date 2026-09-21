-- One row per transaction on a House Periodic Transaction Report of a tracked member (ADR 0018),
-- the trade list of the Stock trades tab. Codes are mapped with the ptr_* seeds; a code no seed
-- maps is kept, its label falls back to the raw code, and `has_unmapped_code` says so (the
-- warning test assert_stock_trade_codes_mapped counts them). The disclosed amount is a band,
-- usually not a figure: `amount_low` and `amount_high` are the band ends, `amount_high` is null for
-- the top band ("Over $50,000,000"), and `amount_kind` is `exact` (low equal to high) when the
-- filer entered a single figure instead of a band. `days_to_file` is the filing date minus the trade date.
-- `source_url` is the PDF with #page=N, the page the row is printed on.
select
    t.bioguide_id,
    t.doc_id,
    t.row_number,
    f.filing_date,
    t.trade_date,
    t.notification_date,
    (f.filing_date - t.trade_date) as days_to_file,
    t.owner_code,
    coalesce(o.label, t.owner_code) as owner_label,
    t.asset_name,
    t.ticker,
    t.asset_type_code,
    coalesce(a.label, t.asset_type_code) as asset_type_label,
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
    (o.code is null or a.code is null or tt.code is null) as has_unmapped_code,
    'house_clerk_ptr' as source,
    t.source_url,
    t.fetched_at
from {{ ref('stg_house_ptr_transactions') }} as t
inner join {{ ref('member') }} as m on m.bioguide_id = t.bioguide_id
inner join {{ ref('stg_house_ptr_filings') }} as f on f.doc_id = t.doc_id
left join {{ ref('ptr_owner_codes') }} as o on o.code = t.owner_code
left join {{ ref('ptr_asset_types') }} as a on a.code = t.asset_type_code
left join {{ ref('ptr_transaction_types') }} as tt on tt.code = t.transaction_type_code
