-- One row per action as Congress.gov lists it, for every bill of the Congress that raw holds:
-- just the code, type, text and date, which is what "how far did it get" is read from.
--
-- stg_bill_actions is the page's action list: limited to bills with a page (stg_bill_scope) and
-- collapsed to one row per day and text. A count over the whole Congress needs neither, and
-- must not lose a code to that collapse, so this reads raw directly (ADR 0025).
select
    a.congress,
    a.bill_type,
    a.bill_number,
    x.value ->> 'actionCode' as action_code,
    x.value ->> 'type' as action_type,
    x.value ->> 'text' as action_text,
    (x.value ->> 'actionDate')::date as action_date
from {{ source('raw', 'bill_actions') }} as a
cross join lateral jsonb_array_elements(a.payload) as x (value)
where a.congress = {{ var('current_congress') }}
