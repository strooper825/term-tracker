-- event_key is the cursor for /feed; it must be unique per member.
select bioguide_id, event_key, count(*) as n
from {{ ref('member_feed') }}
group by 1, 2
having count(*) > 1
