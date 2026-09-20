-- One row per press-release feed item, typed from raw.statement. `guid` is the feed's own item
-- id (sometimes an admin-host ?p= id rather than a public URL); `url` is the public link.
-- `published_at` casts the feed's RFC 822 pubDate; a value Postgres cannot read fails the build
-- rather than becoming a null.
select
    s.bioguide_id,
    s.guid,
    s.payload ->> 'title' as title,
    s.payload ->> 'link' as url,
    (s.payload ->> 'pub_date')::timestamptz as published_at,
    s.payload ->> 'creator' as author,
    coalesce(
        (select array_agg(c.value order by c.ordinality)
         from jsonb_array_elements_text(s.payload -> 'categories') with ordinality as c (value, ordinality)),
        '{}'::text[]
    ) as categories,
    s.payload ->> 'description' as description,
    s.payload ->> 'content_html' as content_html,
    'press_feed' as source,
    s.source_url as feed_url,
    s.fetched_at
from {{ source('raw', 'statement') }} as s
