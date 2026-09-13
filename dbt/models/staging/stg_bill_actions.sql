-- One row per action, unnested from raw.bill_actions.
--
-- Congress.gov publishes the same action more than once for the same bill and day: sometimes
-- byte for byte, more often with a different action code, a different source system, or a
-- different type classification. "Introduced in House" arrives under both `Intro-H` and
-- `1000`, and a committee report arrives from both the Library of Congress and House floor
-- actions. Collapsing only exact duplicates left both on the page, so the grain here is
-- **one row per (bill, date, action text)**: what a reader would call one action.
--
-- The surviving row keeps the code, time and type of the first occurrence in the upstream
-- array, and names every source that reported it in `source_system`. `action_types` keeps
-- every classification the group carried, because a group can be typed `Committee` by one
-- source and `Discharge` by another and the activity feed selects on that (mart.member_feed).
--
-- An action with no text keys on its code instead, so two untitled actions on one day stay
-- apart rather than merging into one.
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
        coalesce(x.value ->> 'text', 'code:' || coalesce(x.value ->> 'actionCode', ''))
            as collapse_text,
        'congress_gov' as source,
        a.source_url,
        a.fetched_at
    from {{ source('raw', 'bill_actions') }} as a
    cross join lateral jsonb_array_elements(a.payload) with ordinality as x (value, ordinality)
),

-- Everything the whole group contributes: every source that reported the action and every
-- type it was filed under.
grouped as (
    select
        congress,
        bill_type,
        bill_number,
        action_date,
        collapse_text,
        count(*) as reported_times,
        string_agg(distinct source_system, ' and ' order by source_system) as source_system,
        array_agg(distinct action_type) filter (where action_type is not null) as action_types
    from unnested
    group by 1, 2, 3, 4, 5
),

-- The first occurrence in the upstream array supplies the fields that cannot be merged.
first_occurrence as (
    select distinct on (congress, bill_type, bill_number, action_date, collapse_text) *
    from unnested
    order by congress, bill_type, bill_number, action_date, collapse_text, action_seq
)

select
    f.congress,
    f.bill_type,
    f.bill_number,
    f.action_seq,
    f.action_date,
    f.action_time,
    f.action_code,
    f.action_text,
    f.action_type,
    g.action_types,
    g.source_system,
    g.reported_times,
    md5(concat_ws('|', f.action_date::text, f.collapse_text)) as action_hash,
    f.source,
    f.source_url,
    f.fetched_at
from first_occurrence as f
inner join grouped as g
    on g.congress = f.congress
    and g.bill_type = f.bill_type
    and g.bill_number = f.bill_number
    and g.action_date = f.action_date
    and g.collapse_text = f.collapse_text
