-- Attendance arithmetic and party-unity bounds must hold for every member and Congress.
select *
from {{ ref('member_vote_stats') }}
where votes_cast + not_voting <> positions
    or party_agreements > party_votes
    or cq_party_agreements > cq_party_votes
    or cq_party_votes > party_votes
    or attendance_pct < 0 or attendance_pct > 100
    or party_unity_pct < 0 or party_unity_pct > 100
