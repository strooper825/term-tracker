-- All committees and subcommittees (not scoped to tracked members: assignments reference them).
select
    thomas_id,
    name,
    chamber,
    parent_thomas_id,
    url,
    jurisdiction,
    source,
    source_url,
    fetched_at
from {{ ref('stg_committees') }}
