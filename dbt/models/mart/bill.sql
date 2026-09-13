-- One row per bill or amendment that a tracked member sponsored or cosponsored, plus every
-- bill a loaded roll call references. Every row has a detail page at
-- /bills/{congress}/{type}/{number}, so every row carries the counts that page shows.
--
-- The counts are taken from mart.bill_cosponsor and mart.bill_summary, which are scoped
-- against stg_bills rather than this model so the three do not reference each other. A zero
-- count means the source published none: the loader stores an empty array for a bill with no
-- cosponsors or no summary, and the dbt test assert_bill_lists_loaded fails the build if any
-- bill is missing a list altogether.
with cosponsors as (
    select
        congress,
        bill_type,
        bill_number,
        count(*) as cosponsor_count,
        count(*) filter (where party = 'D') as cosponsors_democratic,
        count(*) filter (where party = 'R') as cosponsors_republican,
        count(*) filter (where party not in ('D', 'R') or party is null) as cosponsors_other,
        count(*) filter (where is_withdrawn) as cosponsors_withdrawn,
        min(sponsorship_date) as first_cosponsorship_date,
        max(sponsorship_date) as last_cosponsorship_date
    from {{ ref('bill_cosponsor') }}
    group by 1, 2, 3
),

actions as (
    select congress, bill_type, bill_number, count(*) as action_count
    from {{ ref('stg_bill_actions') }}
    group by 1, 2, 3
),

summaries as (
    select
        congress,
        bill_type,
        bill_number,
        count(*) as summary_count,
        max(action_date) as latest_summary_date
    from {{ ref('bill_summary') }}
    group by 1, 2, 3
),

roll_calls as (
    select congress, bill_type, bill_number, count(*) as roll_call_count
    from {{ ref('roll_call') }}
    where bill_type is not null and bill_number is not null
    group by 1, 2, 3
)

select
    b.congress,
    b.bill_type,
    b.bill_number,
    b.kind,
    {{ bill_label('b.bill_type', 'b.bill_number') }} as label,
    b.title,
    b.policy_area,
    b.introduced_date,
    b.latest_action_date,
    b.latest_action_text,
    b.origin_chamber,
    b.sponsor_bioguide_id,
    b.sponsor_full_name,
    coalesce(b.sponsor_name, b.sponsor_full_name) as sponsor_name,
    b.sponsor_party,
    b.sponsor_state,
    b.sponsor_district,
    tm.bioguide_id is not null as sponsor_is_tracked,
    b.amended_bill_congress,
    b.amended_bill_type,
    b.amended_bill_number,
    coalesce(c.cosponsor_count, 0) as cosponsor_count,
    coalesce(c.cosponsors_democratic, 0) as cosponsors_democratic,
    coalesce(c.cosponsors_republican, 0) as cosponsors_republican,
    coalesce(c.cosponsors_other, 0) as cosponsors_other,
    coalesce(c.cosponsors_withdrawn, 0) as cosponsors_withdrawn,
    c.first_cosponsorship_date,
    c.last_cosponsorship_date,
    coalesce(a.action_count, 0) as action_count,
    coalesce(s.summary_count, 0) as summary_count,
    coalesce(s.summary_count, 0) > 0 as has_summary,
    s.latest_summary_date,
    coalesce(rc.roll_call_count, 0) as roll_call_count,
    b.update_date,
    {{ congress_gov_url('b.kind', 'b.congress', 'b.bill_type', 'b.bill_number') }} as congress_gov_url,
    b.source,
    b.source_url,
    b.fetched_at
from {{ ref('stg_bills') }} as b
left join cosponsors as c
    on c.congress = b.congress and c.bill_type = b.bill_type and c.bill_number = b.bill_number
left join actions as a
    on a.congress = b.congress and a.bill_type = b.bill_type and a.bill_number = b.bill_number
left join summaries as s
    on s.congress = b.congress and s.bill_type = b.bill_type and s.bill_number = b.bill_number
left join roll_calls as rc
    on rc.congress = b.congress and rc.bill_type = b.bill_type and rc.bill_number = b.bill_number
left join {{ ref('tracked_members') }} as tm on tm.bioguide_id = b.sponsor_bioguide_id
