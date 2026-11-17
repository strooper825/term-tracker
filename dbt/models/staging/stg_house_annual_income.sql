-- One row per line of Schedule C (Earned Income) of a read House annual report
-- (raw.annual_report_row, part 'C', ADR 0031), in the columns of stg_annual_report_income.
-- Cells: source, type, amount; a new member's report has two amounts, the current year to filing
-- and the preceding year. The House prints no owner column: a spouse's income says so in its
-- type ("Spouse Salary"), so `owner_code` is null rather than guessed. "N/A" is a source listed
-- without its amount (a spouse's earned income need not be stated): `not_stated`.
-- For a new member, the current-year amount is used when stated, else the preceding year's;
-- `amount_period` says which.
with rows as (
    select
        r.source,
        r.doc_id,
        r.bioguide_id,
        r.row_index,
        r.payload -> 'cells' as c,
        r.payload -> 'detail' as d,
        r.payload -> 'cells' ? 'amount_preceding' as two_amounts
    from {{ source('raw', 'annual_report_row') }} as r
    where r.source = 'house_clerk' and r.part = 'C'
),

picked as (
    select
        rows.*,
        case
            when not two_amounts then c ->> 'amount'
            when c ->> 'amount' ~ '^\$' then c ->> 'amount'
            when c ->> 'amount_preceding' ~ '^\$' then c ->> 'amount_preceding'
            else c ->> 'amount'
        end as amount_raw,
        case
            when not two_amounts then null
            when c ->> 'amount' ~ '^\$' then 'Current year to filing'
            when c ->> 'amount_preceding' ~ '^\$' then 'Preceding year'
        end as amount_period
    from rows
),

typed as (
    select picked.*, regexp_match(amount_raw, '^\$([0-9,]+(?:\.[0-9]+)?)$') as exact
    from picked
)

select
    source,
    doc_id,
    bioguide_id,
    row_index,
    null::text as owner_code,
    c ->> 'type' as income_type,
    null::text as income_detail,
    c ->> 'source' as payer,
    null::text as payer_location,
    amount_raw,
    case when exact is not null then 'exact' when amount_raw = 'N/A' then 'not_stated' else 'other' end
        as amount_kind,
    replace(exact[1], ',', '')::numeric(16, 2) as amount_low,
    replace(exact[1], ',', '')::numeric(16, 2) as amount_high,
    amount_period,
    nullif(concat_ws('; ', d ->> 'description', d ->> 'comments', nullif(d ->> 'note', '')), '')
        as comments
from typed
