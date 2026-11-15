-- One row per tracked member the press-page probe has looked at (raw.press_page, ADR 0023).
-- outcome: found (press_url answered with a press listing), not_found, disallowed (robots.txt),
-- unreachable (the site refused or did not answer; press_url is then the one found earlier, if
-- any). site_url is the official website that was probed.
select
    p.bioguide_id,
    p.payload ->> 'outcome' as outcome,
    nullif(p.payload ->> 'press_url', '') as press_url,
    p.payload ->> 'detail' as detail,
    p.source_url as site_url,
    p.fetched_at
from {{ source('raw', 'press_page') }} as p
