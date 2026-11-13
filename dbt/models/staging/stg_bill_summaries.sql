-- One row per CRS summary version, unnested from raw.bill_summaries. A bill with no summary
-- has an empty array upstream and so contributes no rows here (the mart still carries the
-- bill, with has_summary false).
--
-- `version_code` is the Congress.gov stage code ("00" Introduced, "07" Reported, "53" Passed
-- House, "55" Passed Senate, "49" Public Law and so on); the loader refuses a payload that
-- repeats one for the same bill, so (bill, version_code) is a key. `seq` is the position in
-- the upstream array, which breaks ties when two versions share an action date (a bill
-- introduced and reported the same day).
select
    s.congress,
    s.bill_type,
    s.bill_number,
    x.value ->> 'versionCode' as version_code,
    x.ordinality::int as seq,
    (x.value ->> 'actionDate')::date as action_date,
    x.value ->> 'actionDesc' as action_desc,
    x.value ->> 'text' as text_html,
    (x.value ->> 'updateDate')::timestamptz as update_date,
    'congress_gov' as source,
    s.source_url,
    s.fetched_at
from {{ source('raw', 'bill_summaries') }} as s
-- only bills the mart keeps (ADR 0023): raw may hold the whole Congress
inner join {{ ref('stg_bill_scope') }} as scope
    on scope.congress = s.congress
    and scope.bill_type = s.bill_type
    and scope.bill_number = s.bill_number
cross join lateral jsonb_array_elements(s.payload) with ordinality as x (value, ordinality)
-- Only the tracked Congress: raw keeps every Congress ever loaded, and the mart, the API and
-- the site describe one (ADR 0021).
where s.congress = {{ var('current_congress') }}
