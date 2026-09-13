-- One row per House roll call: the session-list item joined to the members record for the
-- question text. source_url is the House Clerk XML that Congress.gov itself cites.
select
    v.congress,
    'house' as chamber,
    v.session,
    v.roll_number,
    (v.payload ->> 'startDate')::timestamptz as voted_at,
    ((v.payload ->> 'startDate')::timestamptz at time zone 'America/New_York')::date as vote_date,
    m.payload ->> 'voteQuestion' as question,
    m.payload ->> 'voteQuestion' as question_short,
    v.payload ->> 'result' as result,
    v.payload ->> 'voteType' as vote_type,
    null::text as majority_requirement,
    lower(v.payload ->> 'legislationType') as bill_type,
    v.payload ->> 'legislationNumber' as bill_number,
    null::text as document_type,
    null::text as document_number,
    case when v.payload ->> 'legislationNumber' is null then 0 else 1 end as document_count,
    v.payload ->> 'legislationUrl' as legislation_url,
    'congress_gov' as source,
    coalesce(v.payload ->> 'sourceDataURL', v.source_url) as source_url,
    v.fetched_at
from {{ source('raw', 'house_vote') }} as v
left join {{ source('raw', 'house_vote_members') }} as m
    on m.congress = v.congress and m.session = v.session and m.roll_number = v.roll_number
