-- Weekly buckets of typed events per tracked member (plan section 2, panel 4). Weeks start
-- on Monday. Built from member_feed so the two panels never disagree.
select
    bioguide_id,
    date_trunc('week', event_date)::date as week_start,
    event_type,
    count(*) as events,
    min(event_date) as first_event_date,
    max(event_date) as last_event_date,
    min(source) as source,
    min(source_url) as source_url,
    max(fetched_at) as fetched_at
from {{ ref('member_feed') }}
group by 1, 2, 3
