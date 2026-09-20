-- One row per tracked member: how the Public statements tab treats them. `feed` members have
-- their releases in mart.statement; `link` members get a link to the office's press page. The
-- counts and dates are null / zero for link members and for a feed member with nothing loaded
-- yet. `source_url` is the press listing a person can open to check the tab against.
select
    ss.bioguide_id,
    ss.mode,
    ss.label,
    ss.press_url,
    ss.feed_url,
    coalesce(agg.statements, 0) as statements,
    agg.oldest_published_at,
    agg.newest_published_at,
    -- A link member is never fetched; its date is the day a person checked the press URL.
    coalesce(agg.fetched_at, '{{ var("statement_sources_checked_at") }}'::timestamptz) as fetched_at,
    case ss.mode when 'feed' then 'press_feed' else 'press_page' end as source,
    ss.press_url as source_url
from {{ ref('statement_sources') }} as ss
inner join {{ ref('member') }} as m on m.bioguide_id = ss.bioguide_id
left join (
    select
        bioguide_id,
        count(*)::int as statements,
        min(published_at) as oldest_published_at,
        max(published_at) as newest_published_at,
        max(fetched_at) as fetched_at
    from {{ ref('statement') }}
    group by 1
) as agg on agg.bioguide_id = ss.bioguide_id
