-- The status must agree with which columns are populated, the receipt sources must partition
-- total receipts (other is the residual and may not be negative beyond rounding), and the
-- shares must add up to 100 for a filed row.
select *
from {{ ref('member_fundraising') }}
where (status = 'filed') <> (raised is not null)
    or (status in ('filed', 'no_filings')) <> (committee_id is not null)
    or (status <> 'no_candidate') <> (candidate_id is not null)
    or (status = 'filed' and (
        other < -0.01
        or abs(
            coalesce(individual_small_pct, 0) + coalesce(individual_large_pct, 0)
            + coalesce(pac_pct, 0) + coalesce(party_pct, 0) + coalesce(self_funding_pct, 0)
            + coalesce(transfers_pct, 0) + coalesce(other_pct, 0) - 100
        ) > 0.1
        or abs(coalesce(individual_pct, 0) - coalesce(individual_small_pct, 0)
            - coalesce(individual_large_pct, 0)) > 0.02
        or small_donor_pct <> individual_small_pct
        or raised < 0 or spent < 0 or cash_on_hand < 0 or debts < 0
    ))
