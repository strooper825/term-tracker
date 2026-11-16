-- One row per member and year with a read report (annual_report_version, ADR 0028): what the
-- report's assets and liabilities add up to. Every figure is a range, because every value is
-- reported as a band:
--   assets_low / assets_high      the sums of the low and high ends of the asset bands; "None (or
--                                 less than $1,001)" counts 0 to 1,000; an account line counts
--                                 nothing (its holdings do)
--   assets_high_is_open           an asset is in a top band with no upper end, so assets_high is
--                                 a floor and the net-worth high end is unknown
--   unascertainable               asset lines the filer could not value; they count in no sum
--   liabilities_low / _high       the same for liabilities
--   net_low                       assets_low - liabilities_high: the least the reported assets
--                                 minus reported debts could be (null if a debt has no upper end)
--   net_high                      assets_high - liabilities_low (null if an asset has no upper end)
-- It is reported net worth, not full net worth: a member need not report everything (a home that
-- earns no income, for instance), and a spouse's or child's assets are included when reported.
with assets as (
    select
        doc_id,
        count(*) filter (where counts_in_total and not is_account)::int as holdings,
        count(*) filter (where value_kind = 'unascertainable')::int as unascertainable,
        coalesce(sum(value_low) filter (where counts_in_total and not is_account), 0) as assets_low,
        coalesce(sum(value_high) filter (where counts_in_total and not is_account), 0) as assets_high,
        coalesce(bool_or(value_kind = 'top_band'), false) as assets_high_is_open
    from {{ ref('annual_asset') }}
    group by 1
),

liabilities as (
    select
        doc_id,
        count(*)::int as liabilities,
        coalesce(sum(amount_low), 0) as liabilities_low,
        coalesce(sum(amount_high), 0) as liabilities_high,
        coalesce(bool_or(amount_kind = 'top_band'), false) as liabilities_high_is_open
    from {{ ref('annual_liability') }}
    group by 1
)

select
    v.bioguide_id,
    v.covers_year,
    v.doc_id,
    v.kind,
    v.amendment,
    v.filing_date,
    coalesce(a.holdings, 0) as holdings,
    coalesce(a.unascertainable, 0) as unascertainable,
    coalesce(a.assets_low, 0) as assets_low,
    coalesce(a.assets_high, 0) as assets_high,
    coalesce(a.assets_high_is_open, false) as assets_high_is_open,
    coalesce(l.liabilities, 0) as liabilities,
    coalesce(l.liabilities_low, 0) as liabilities_low,
    coalesce(l.liabilities_high, 0) as liabilities_high,
    coalesce(l.liabilities_high_is_open, false) as liabilities_high_is_open,
    case when not coalesce(l.liabilities_high_is_open, false)
        then coalesce(a.assets_low, 0) - coalesce(l.liabilities_high, 0) end as net_low,
    case when not coalesce(a.assets_high_is_open, false)
        then coalesce(a.assets_high, 0) - coalesce(l.liabilities_low, 0) end as net_high,
    v.source,
    v.source_url
from {{ ref('annual_report_version') }} as v
left join assets as a on a.doc_id = v.doc_id
left join liabilities as l on l.doc_id = v.doc_id
