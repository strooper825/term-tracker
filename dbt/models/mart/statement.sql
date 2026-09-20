-- One row per press release a tracked member's office published on its own feed since the
-- tracked Congress began (ADR 0015). `content_html` is the feed's full text verbatim; the site
-- sanitises it at build time. `source_url` is the release's own page, `feed_url` where it was
-- read from.
select
    s.bioguide_id,
    s.guid,
    s.title,
    s.published_at,
    (s.published_at at time zone 'America/New_York')::date as published_date,
    s.url,
    s.author,
    s.categories,
    s.description,
    s.content_html,
    s.feed_url,
    s.source,
    s.url as source_url,
    s.fetched_at
from {{ ref('stg_statements') }} as s
inner join {{ ref('member') }} as m on m.bioguide_id = s.bioguide_id
