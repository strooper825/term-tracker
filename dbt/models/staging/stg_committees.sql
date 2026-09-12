-- Committees and subcommittees as one flat list. A subcommittee's thomas_id is its parent's
-- thomas_id plus the two-character suffix in the source, matching committee-membership ids.
with parents as (
    select
        thomas_id,
        payload ->> 'name' as name,
        payload ->> 'type' as chamber,
        null::text as parent_thomas_id,
        payload ->> 'url' as url,
        payload ->> 'jurisdiction' as jurisdiction,
        'legislators' as source,
        source_url,
        fetched_at
    from {{ source('raw', 'committee') }}
),

subcommittees as (
    select
        p.thomas_id || (s.value ->> 'thomas_id') as thomas_id,
        s.value ->> 'name' as name,
        p.payload ->> 'type' as chamber,
        p.thomas_id as parent_thomas_id,
        null::text as url,
        null::text as jurisdiction,
        'legislators' as source,
        p.source_url,
        p.fetched_at
    from {{ source('raw', 'committee') }} as p
    cross join lateral jsonb_array_elements(coalesce(p.payload -> 'subcommittees', '[]'::jsonb)) as s (value)
)

select * from parents
union all
select * from subcommittees
