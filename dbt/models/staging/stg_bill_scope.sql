-- The bills and amendments the mart keeps: one a tracked member sponsored or cosponsored, or
-- one a loaded roll call names. Everything downstream is scoped through stg_bills, which
-- joins this.
--
-- Until ADR 0023 the scope was implicit: raw.bill held only what the ingest had fetched for
-- the tracked members, so "every row of raw.bill" was the scope. The incremental ingest reads
-- the whole Congress into raw, so the rule is written down here instead, and it reads the
-- bills' own records (the sponsor on the detail, the bill's cosponsors list), not the
-- members' lists. On the twenty-member database of 2026-11-13 the two give the same 4,592
-- bills and the same 6,373 sponsorship rows.
--
-- A withdrawn cosponsorship still counts: the member's dashboard lists it as withdrawn, so
-- the bill needs its page. A table, not a view: four models read it and it unnests every
-- cosponsors list in the Congress. It is indexed and analysed as soon as it is built: without
-- statistics on a table minutes old the planner joined it row by row, and mart.bill took four
-- minutes instead of two seconds (measured 2026-11-13).
{{ config(
    materialized='table',
    post_hook=[
        "create unique index if not exists stg_bill_scope_key on {{ this }} (congress, bill_type, bill_number)",
        "analyze {{ this }}",
    ],
) }}

with tracked as (
    select bioguide_id from {{ ref('tracked_members') }}
)

select b.congress, b.bill_type, b.bill_number
from {{ source('raw', 'bill') }} as b
inner join tracked as t on t.bioguide_id = b.payload -> 'sponsors' -> 0 ->> 'bioguideId'
where b.congress = {{ var('current_congress') }}

union

select c.congress, c.bill_type, c.bill_number
from {{ ref('stg_bill_cosponsors') }} as c
inner join tracked as t on t.bioguide_id = c.bioguide_id

union

select congress, bill_type, bill_number
from {{ ref('stg_house_roll_calls') }}
where bill_type is not null and bill_number is not null

union

select congress, bill_type, bill_number
from {{ ref('stg_senate_roll_calls') }}
where bill_type is not null and bill_number is not null
