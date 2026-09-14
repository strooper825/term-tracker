-- One row per row of the MIT Election Lab House and Senate files (raw.election_return_contest
-- payloads), typed. Spellings are normalised here (stage and mode lower-cased, True/False to
-- booleans); names and parties stay as published, upper case. vote_kind classifies the
-- ballot artefacts that share the candidate column (macro election_vote_kind, ADR 0008).
select
    c.office,
    c.year,
    c.state_po,
    case when c.office = 'house' then c.district::int end as district,
    c.stage,
    c.special,
    r.ordinality::int as row_index,
    r.value ->> 'candidate' as candidate,
    -- The Senate file calls the column party_detailed, the House file party (and writes NA
    -- for scattering and blank rows).
    nullif(nullif(coalesce(r.value ->> 'party_detailed', r.value ->> 'party'), ''), 'NA')
        as party_detailed,
    nullif(r.value ->> 'party_simplified', '') as party_simplified,
    lower(r.value ->> 'writein') = 'true' as writein,
    lower(r.value ->> 'mode') as mode,
    -- An uncontested race whose votes were not counted carries totalvotes -1 (House codebook);
    -- its counts are placeholders, so both become null and votes_reported is false.
    (r.value ->> 'totalvotes')::numeric >= 0 as votes_reported,
    case
        when (r.value ->> 'totalvotes')::numeric >= 0
            then (r.value ->> 'candidatevotes')::numeric::bigint
    end as candidatevotes,
    case
        when (r.value ->> 'totalvotes')::numeric >= 0
            then (r.value ->> 'totalvotes')::numeric::bigint
    end as totalvotes,
    lower(coalesce(r.value ->> 'unofficial', 'false')) = 'true' as unofficial,
    {{ election_vote_kind("r.value ->> 'candidate'", "lower(r.value ->> 'writein') = 'true'") }}
        as vote_kind,
    c.dataset_version,
    c.file_md5,
    'mit_election_lab' as source,
    c.source_url,
    c.fetched_at
from {{ source('raw', 'election_return_contest') }} as c
cross join lateral jsonb_array_elements(c.payload) with ordinality as r (value, ordinality)
