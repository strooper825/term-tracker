-- Bills the tracked members introduced, by measure type: one row per type (ADR 0013), with the
-- share of the total the stacked bar draws its segment width from. The four counts sum to
-- congress_overview.bills_introduced (dbt test assert_congress_overview_consistent).
with counts as (
    select measure_type, count(*) as bills, max(fetched_at) as fetched_at
    from {{ ref('congress_tracked_bill') }}
    group by measure_type
),

types (measure_type, type_label, short_label, sort_order) as (
    values
        ('house_bill', 'House bills', 'H.R.', 1),
        ('senate_bill', 'Senate bills', 'S.', 2),
        ('joint_resolution', 'Joint resolutions', 'J.Res.', 3),
        ('other', 'Other', 'Other', 4)
)

select
    t.measure_type,
    t.type_label,
    t.short_label,
    t.sort_order,
    coalesce(c.bills, 0) as bills,
    round(100.0 * coalesce(c.bills, 0) / nullif(sum(coalesce(c.bills, 0)) over (), 0), 2)
        as bill_pct,
    'congress_gov' as source,
    'https://www.congress.gov/' as source_url,
    c.fetched_at
from types as t
left join counts as c on c.measure_type = t.measure_type
