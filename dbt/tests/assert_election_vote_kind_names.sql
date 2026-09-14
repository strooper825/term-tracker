-- No row classified as a named candidate may look like a ballot artefact; a new spelling in a
-- refreshed snapshot fails here instead of being counted as a candidate (macro
-- election_vote_kind, ADR 0008).
select year, state_po, office, district, candidate, candidatevotes
from {{ ref('stg_election_returns') }}
where vote_kind = 'candidate'
    and upper(candidate) ~ '(VOTES?$|SCATTER|WRITE.?IN|^BLANKS?$|^BLANK VOTE|^VOID|SPOIL|(^| )OTHERS?$|MISCELLANEOUS|^NONE OF)'
