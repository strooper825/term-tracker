-- One row per state legislator or governor kept from openstates/people (raw.state_person,
-- ADR 0035): who they are and how to reach them. Party history is stg_state_parties; roles are
-- stg_state_roles.
select
    p.person_id,
    p.state,
    p.folder,
    p.payload ->> 'name' as name,
    nullif(p.payload ->> 'given_name', '') as given_name,
    nullif(p.payload ->> 'family_name', '') as family_name,
    nullif(p.payload ->> 'image', '') as image_url,
    nullif(p.payload ->> 'email', '') as email,
    -- the first link is the member's page on the legislature's site
    nullif(p.payload -> 'links' -> 0 ->> 'url', '') as website_url,
    p.source_url,
    p.fetched_at
from {{ source('raw', 'state_person') }} as p
