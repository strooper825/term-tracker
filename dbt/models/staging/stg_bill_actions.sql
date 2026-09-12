-- One row per action, unnested from raw.bill_actions. Identical duplicate actions (same date,
-- code, text, and source system) collapse to one row so the natural key holds.
with unnested as (
    select
        a.congress,
        a.bill_type,
        a.bill_number,
        x.ordinality as action_seq,
        (x.value ->> 'actionDate')::date as action_date,
        x.value ->> 'actionTime' as action_time,
        x.value ->> 'actionCode' as action_code,
        x.value ->> 'text' as action_text,
        x.value ->> 'type' as action_type,
        x.value -> 'sourceSystem' ->> 'name' as source_system,
        md5(
            concat_ws(
                '|',
                x.value ->> 'actionDate',
                coalesce(x.value ->> 'actionCode', ''),
                coalesce(x.value ->> 'text', ''),
                coalesce(x.value -> 'sourceSystem' ->> 'code', '')
            )
        ) as action_hash,
        'congress_gov' as source,
        a.source_url,
        a.fetched_at
    from {{ source('raw', 'bill_actions') }} as a
    cross join lateral jsonb_array_elements(a.payload) with ordinality as x (value, ordinality)
)

select distinct on (congress, bill_type, bill_number, action_date, action_hash) *
from unnested
order by congress, bill_type, bill_number, action_date, action_hash, action_seq
