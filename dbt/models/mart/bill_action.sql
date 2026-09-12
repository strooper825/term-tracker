-- One row per action on a bill or amendment in mart.bill. Feeds the timeline and feed panels.
select
    a.congress,
    a.bill_type,
    a.bill_number,
    a.action_date,
    a.action_time,
    a.action_hash,
    a.action_seq,
    a.action_code,
    a.action_text,
    a.action_type,
    a.source_system,
    a.source,
    a.source_url,
    a.fetched_at
from {{ ref('stg_bill_actions') }} as a
inner join {{ ref('bill') }} as b
    on b.congress = a.congress and b.bill_type = a.bill_type and b.bill_number = a.bill_number
