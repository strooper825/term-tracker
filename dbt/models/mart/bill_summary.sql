-- One row per CRS summary version of a bill in mart.bill. The bill page shows the latest
-- version in full and lists the earlier ones as a version history, so every version is kept.
--
-- `is_latest` marks the most recent version: greatest action_date, and where two versions
-- share a date (a bill introduced and reported the same day) the later position in the
-- upstream array wins. Exactly one row per bill carries it (dbt test
-- assert_bill_summary_one_latest).
--
-- `text_html` is the summary as the Congressional Research Service publishes it, HTML and
-- all. It is stored verbatim; the site renders it through an allowlist of tags at build time.
--
-- Scoped against stg_bills rather than mart.bill so that mart.bill can count these rows
-- without the two models referencing each other.
with ranked as (
    select
        s.*,
        row_number() over (
            partition by s.congress, s.bill_type, s.bill_number
            order by s.action_date desc, s.seq desc
        ) as recency
    from {{ ref('stg_bill_summaries') }} as s
)

select
    r.congress,
    r.bill_type,
    r.bill_number,
    r.version_code,
    r.seq,
    r.action_date,
    r.action_desc,
    r.text_html,
    length(r.text_html) as text_length,
    r.update_date,
    r.recency = 1 as is_latest,
    r.source,
    r.source_url,
    r.fetched_at
from ranked as r
inner join {{ ref('stg_bills') }} as b
    on b.congress = r.congress and b.bill_type = r.bill_type and b.bill_number = r.bill_number
