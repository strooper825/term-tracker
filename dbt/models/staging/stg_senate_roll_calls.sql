-- One row per Senate roll call from the vote XML. vote_date upstream looks like
-- "January 9, 2025,  02:54 PM" (Eastern, variable whitespace); document_type is the Senate
-- style ("S.", "H.R.", "PN" for nominations) and is mapped to the Congress.gov bill_type.
with src as (
    select
        congress,
        session,
        vote_number,
        payload,
        source_url,
        fetched_at,
        regexp_replace(payload ->> 'vote_date', '\s+', ' ', 'g') as vote_date_text,
        -- en bloc votes carry a list of documents; take the first and count them
        case
            when jsonb_typeof(payload -> 'document') = 'array' then payload -> 'document' -> 0
            else payload -> 'document'
        end as document,
        case
            when jsonb_typeof(payload -> 'document') = 'array'
                then jsonb_array_length(payload -> 'document')
            when payload -> 'document' is null then 0
            else 1
        end as document_count
    from {{ source('raw', 'senate_vote') }}
),

src_docs as (
    select
        src.*,
        document ->> 'document_type' as document_type,
        case when document_count = 1 then document ->> 'document_number' end as document_number
    from src
)

select
    congress,
    'senate' as chamber,
    session,
    vote_number as roll_number,
    to_timestamp(vote_date_text, 'FMMonth DD, YYYY, HH12:MI AM')
        at time zone 'America/New_York' as voted_at,
    to_date(vote_date_text, 'FMMonth DD, YYYY, HH12:MI AM') as vote_date,
    btrim(regexp_replace(
        coalesce(payload ->> 'vote_question_text', payload ->> 'question'), '\s+', ' ', 'g'
    )) as question,
    -- the short form without the measure or nomination list ("On the Cloture Motion")
    btrim(regexp_replace(payload ->> 'question', '\s+', ' ', 'g')) as question_short,
    payload ->> 'vote_result' as result,
    null::text as vote_type,
    payload ->> 'majority_requirement' as majority_requirement,
    case document_type
        when 'S.' then 's'
        when 'H.R.' then 'hr'
        when 'S.Res.' then 'sres'
        when 'H.Res.' then 'hres'
        when 'S.J.Res.' then 'sjres'
        when 'H.J.Res.' then 'hjres'
        when 'S.Con.Res.' then 'sconres'
        when 'H.Con.Res.' then 'hconres'
    end as bill_type,
    case
        when document_type in ('S.', 'H.R.', 'S.Res.', 'H.Res.', 'S.J.Res.', 'H.J.Res.',
                               'S.Con.Res.', 'H.Con.Res.')
        then document_number
    end as bill_number,
    document_type,
    document_number,
    document_count,
    null::text as legislation_url,
    'senate_gov' as source,
    source_url,
    fetched_at
from src_docs
