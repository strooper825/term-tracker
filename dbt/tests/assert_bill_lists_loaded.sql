-- Every bill on a detail page must have its three dependent lists loaded, so a zero count on
-- the page means "the source published none" and never "the loader has not fetched it yet".
-- An empty array counts as loaded; a missing row does not. Amendments have no summaries
-- endpoint (it answers 404), so they are exempt from that one.
select
    b.congress,
    b.bill_type,
    b.bill_number,
    b.kind,
    a.congress is null as missing_actions,
    c.congress is null as missing_cosponsors,
    s.congress is null as missing_summaries
from {{ ref('bill') }} as b
left join {{ source('raw', 'bill_actions') }} as a using (congress, bill_type, bill_number)
left join {{ source('raw', 'bill_cosponsors') }} as c using (congress, bill_type, bill_number)
left join {{ source('raw', 'bill_summaries') }} as s using (congress, bill_type, bill_number)
where a.congress is null
    or c.congress is null
    or (s.congress is null and b.kind = 'bill')
