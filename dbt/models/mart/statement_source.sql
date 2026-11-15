-- One row per tracked member with somewhere to send a reader: how the Public statements tab
-- treats them. `feed` members have their releases in mart.statement; `link` members get a link.
--
-- seed.statement_sources is the list of members a person checked (ADR 0015). Everyone else is
-- `link` by default (ADR 0023): to the press page the monthly probe found on the office's own
-- site, else to the official website from congress-legislators. `link_kind` says which, so the
-- tab never calls a home page a press page. A member with no seed row and no website has no
-- row here.
--
-- The counts and dates are null / zero for link members and for a feed member with nothing
-- loaded yet. `source_url` is the page a person can open to check the tab against.
with statements as (
    select
        bioguide_id,
        count(*)::int as statements,
        min(published_at) as oldest_published_at,
        max(published_at) as newest_published_at,
        max(fetched_at) as fetched_at
    from {{ ref('statement') }}
    group by 1
),

checked as (
    select
        ss.bioguide_id,
        ss.mode,
        ss.label,
        ss.press_url,
        ss.feed_url,
        'press_page' as link_kind,
        -- A link member is never fetched; its date is the day a person checked the press URL.
        '{{ var("statement_sources_checked_at") }}'::timestamptz as checked_at
    from {{ ref('statement_sources') }} as ss
),

unchecked as (
    select
        m.bioguide_id,
        'link' as mode,
        coalesce(p.press_url, c.website_url) as press_url,
        null::text as feed_url,
        case when p.press_url is not null then 'press_page' else 'official_website' end
            as link_kind,
        coalesce(p.fetched_at, c.fetched_at) as checked_at
    from {{ ref('member') }} as m
    left join {{ ref('member_contact') }} as c on c.bioguide_id = m.bioguide_id
    left join {{ ref('stg_press_pages') }} as p on p.bioguide_id = m.bioguide_id
    where m.bioguide_id not in (select bioguide_id from checked)
      and coalesce(p.press_url, c.website_url) is not null
),

sources as (
    select bioguide_id, mode, label, press_url, feed_url, link_kind, checked_at from checked
    union all
    select
        bioguide_id,
        mode,
        -- the host, as the hand-written labels are: https://www.example.senate.gov/x -> example.senate.gov
        regexp_replace(press_url, '^[a-z]+://(www\.)?([^/:?#]+).*$', '\2') as label,
        press_url,
        feed_url,
        link_kind,
        checked_at
    from unchecked
)

select
    s.bioguide_id,
    s.mode,
    s.label,
    s.press_url,
    s.feed_url,
    s.link_kind,
    coalesce(agg.statements, 0) as statements,
    agg.oldest_published_at,
    agg.newest_published_at,
    coalesce(agg.fetched_at, s.checked_at) as fetched_at,
    case
        when s.mode = 'feed' then 'press_feed'
        when s.link_kind = 'official_website' then 'official_website'
        else 'press_page'
    end as source,
    s.press_url as source_url
from sources as s
inner join {{ ref('member') }} as m on m.bioguide_id = s.bioguide_id
left join statements as agg on agg.bioguide_id = s.bioguide_id
