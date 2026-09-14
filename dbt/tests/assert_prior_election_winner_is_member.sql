-- A found prior election must have been won by the tracked member (name match on last name),
-- with shares that add up. A failure means the contest lookup picked the wrong race or the
-- vote classification let a ballot artefact outrank a candidate (ADR 0008).
select *
from {{ ref('member_prior_election') }}
where (status = 'uncontested' and not winner_is_member)
    or status = 'found' and (
        not winner_is_member
        or winner_pct is null
        or winner_pct + coalesce(runner_up_pct, 0) > 100.005
        or margin_votes <> winner_votes - coalesce(runner_up_votes, 0)
        -- totalvotes includes blank and over votes in some files (Vermont 2024 Senate) and not
        -- in others (NY-8 2024 House), so only valid votes are bounded by it
        or valid_votes > reported_total_votes
    )
