-- One row per action on a bill or amendment in mart.bill, one row per (date, action text):
-- see stg_bill_actions for how the duplicates Congress.gov publishes are collapsed.
-- Feeds the timeline and feed panels.
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
    a.action_types,
    a.source_system,
    a.reported_times,
    a.source,
    a.source_url,
    a.fetched_at
from {{ ref('stg_bill_actions') }} as a
inner join {{ ref('bill') }} as b
    on b.congress = a.congress and b.bill_type = a.bill_type and b.bill_number = a.bill_number
