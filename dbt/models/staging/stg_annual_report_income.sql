-- One row per line of Part 2 (Earned and Non-Investment Income) of a read Senate annual report
-- (raw.annual_report_row, ADR 0030). eFD's cells: (blank), #, who was paid, type (with the
-- filer's description in parentheses as a note when the type is "Other" or needs one), who paid
-- (with its city as a note), amount paid, comments (as a note; "n/a" is none).
-- A member's own income is printed to the cent and is `exact`; a spouse's is reported only as
-- "> $1,000" (over the reporting threshold), which is `over` with that threshold as the low end.
with rows as (
    select
        r.source,
        r.doc_id,
        r.bioguide_id,
        r.row_index,
        r.payload -> 'cells' as c,
        regexp_match(r.payload -> 'cells' -> 5 ->> 'text', '^\$([0-9,]+(?:\.[0-9]+)?)$') as exact,
        regexp_match(r.payload -> 'cells' -> 5 ->> 'text', '^> \$([0-9,]+)$') as over
    from {{ source('raw', 'annual_report_row') }} as r
    where r.source = 'senate_efd' and r.part = '2'
)

select
    source,
    doc_id,
    bioguide_id,
    row_index,
    case c -> 2 ->> 'text'
        when 'Self' then 'SELF'
        when 'Spouse' then 'SP'
        when 'Joint' then 'JT'
        when 'Child' then 'DC'
        when 'Dependent Child' then 'DC'
        else c -> 2 ->> 'text'
    end as owner_code,
    c -> 3 ->> 'text' as income_type,
    -- "(Book advance)", or "((Required Minimum Distribution))": one pair of outer brackets is eFD's
    nullif(regexp_replace(c -> 3 -> 'notes' ->> 0, '^\((.*)\)$', '\1'), '') as income_detail,
    c -> 4 ->> 'text' as payer,
    c -> 4 -> 'notes' ->> 0 as payer_location,
    c -> 5 ->> 'text' as amount_raw,
    case when exact is not null then 'exact' when over is not null then 'over' else 'other' end
        as amount_kind,
    coalesce(replace(exact[1], ',', ''), replace(over[1], ',', ''))::numeric(16, 2) as amount_low,
    replace(exact[1], ',', '')::numeric(16, 2) as amount_high,
    null::text as amount_period,
    nullif(nullif(trim(concat_ws(' ',
        c -> 6 ->> 'text',
        array_to_string(array(select jsonb_array_elements_text(c -> 6 -> 'notes')), '; ')
    )), ''), 'n/a') as comments
from rows
