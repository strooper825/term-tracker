-- Calendar events from the hand-maintained seed (plan section 4, key_date; panel 6).
select
    date,
    label,
    kind,
    scope,
    scope_value,
    note,
    'key_dates_seed' as source,
    source_url,
    '{{ var("key_dates_fetched_at") }}'::timestamptz as fetched_at
from {{ ref('key_dates') }}
