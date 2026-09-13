-- One row per bill or amendment that a tracked member sponsored or cosponsored, plus every
-- bill a loaded roll call references (detail only; see ingest/sources/congress_gov.py).
select
    b.congress,
    b.bill_type,
    b.bill_number,
    b.kind,
    b.title,
    b.policy_area,
    b.introduced_date,
    b.latest_action_date,
    b.latest_action_text,
    b.origin_chamber,
    b.sponsor_bioguide_id,
    b.amended_bill_congress,
    b.amended_bill_type,
    b.amended_bill_number,
    b.update_date,
    {{ congress_gov_url('b.kind', 'b.congress', 'b.bill_type', 'b.bill_number') }} as congress_gov_url,
    b.source,
    b.source_url,
    b.fetched_at
from {{ ref('stg_bills') }} as b
