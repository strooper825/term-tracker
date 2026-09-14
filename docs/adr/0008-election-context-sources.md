# 0008. Next Election card: MIT Election Lab prior results, hand-maintained opponents, computed in the mart

Date: 2026-09-14
Status: Accepted

## Context

docs/PLAN.md panel 2 lists "opponent(s) if known, filing status; race rating (manual field)"
with the source "Manual / FEC candidate list". The research in
[docs/research/election-context.md](../research/election-context.md) (2026-09-13) found that
none of that works as written:

- **OpenFEC has no vote counts.** `/elections/` lists filers, not the ballot. It records no
  primary outcomes, and a nominee who has raised under $5,000 may be missing entirely (NY-8's
  Republican nominee, Lewis Mizrahi). No receipts or committee-status filter recovers the
  November ballot.
- **The Clerk of the House statistics are authoritative but PDF only.** The MIT Election Data and
  Science Lab compiles them into CC0 constituency returns: *U.S. House 1976–2024*
  (doi:10.7910/DVN/IG0UN2) and *U.S. Senate statewide 1976–2024* (doi:10.7910/DVN/PEJ5QU).
- **The House dataset is gated.** Harvard Dataverse refuses the House file without a guestbook
  response (guestbook 458: name, email, institution and position all required); the Senate
  file is not gated. An unattended nightly job cannot download it without sending a person's
  details on every run.
- The card's date and "On the ballot" were computed in the site (`buildElection` in
  `site/src/lib/model.ts`) from key dates, against plan section 7. That code also showed Class
  1 senators the 2026 date.
- Race rating is paywalled editorial content, not data.

## Decision

1. **Prior result: MIT Election Lab, as committed snapshots.** Both files are downloaded by hand
   in their original upload format and committed under `data/mit_election_lab/`. The House
   file goes through the guestbook in a browser. The loader (`ingest/sources/mit_election_lab.py`)
   reads them from the repository, not the network. It refuses a file whose MD5 differs from the
   checksum Dataverse publishes for the recorded dataset version (House v15.0, Senate v8.0). It
   skips files already stored with that MD5, so a normal night makes no requests and writes no
   rows. Refresh by hand after each certified cycle: download the new version, replace the file,
   and update the manifest (version, MD5, retrieval time) in the same commit. The two files differ
   in shape (verified 2026-09-14), so the manifest records each file's delimiter and party column:
   - The Senate original is a CSV with `party_detailed`.
   - The House original is also comma-separated, although Dataverse names it `.tab`, and has
     `party` (`NA` on scattering and blank rows), `runoff` and `fusion_ticket`.
   - The House file marks an uncontested race whose votes were not counted with `totalvotes`
     -1, as its codebook documents. That occurs in three rows, none a tracked member's. Such a
     contest is `uncontested`: the winner is named and every count and share is null.
2. **Vote shares exclude blank and over votes, everywhere.** The denominator (`valid_votes`)
   counts named candidates, write-ins, scattering and "none of these candidates". It excludes
   blank ballots, undervotes, overvotes, void and spoiled ballots, and the rows that combine
   blank votes with others ("BLANK VOTE/SCATTERING"), which cannot be split. A candidate on
   several party lines (New York fusion) is one candidate with the lines summed.
3. **The prior election is the one that began the member's current term,** for the seat as it
   was then: Kiley's is 2024 CA-3, although his next race is CA-6. Every row cites the Clerk's
   statistics for that year, and the MIT dataset version is kept beside it. dbt tests fail the
   build if the winner is not the member, or if a ballot artefact is classified as a candidate.
4. **Opponent: a hand-maintained seed, `race_nominees`,** scoped like `key_dates`. There is one
   row per race on this cycle's ballot for a tracked member, naming the major opponent, with a
   source confirming the nomination and the date it was checked. The race's district is recorded
   when redistricting moved it. A dbt test fails any row whose member is not on that election's
   ballot.
5. **Scaling ceiling on the opponent list.** The nominee list is maintained for tracked members
   only.
   - Unlike `key_dates`, which saturates at 50 state rows and covers every future member for
     free, it does not scale: each tracked member with a contested seat adds one race to research
     and re-verify every election cycle.
   - **If tracked members ever expand well beyond the current handful, the Opponent field
     defaults back to "Not yet available" rather than becoming an unbounded manual burden,**
     unless a better automated source is found by then.
   - This is the explicit ceiling on the feature, not an open question.
   - The fallback needs no code: a race without a seed row has `opponent_status = not_researched`,
     which the card already renders as "Not yet available".
6. **Next election is computed in the mart** (`mart.member_next_election`):
   - The date is the regular general election that fills the seat when the latest term ends
     (2 U.S.C. 7): 2026 for House members and Class 2 senators, 2030 for Class 1.
   - `on_ballot_this_cycle` compares that year with the current cycle.
   - The API adds days away, as it does days remaining in the term.
   - The card shows the general election for the seat. State primaries stay on the Key dates
     card, whereas the old site code showed whichever election-kind key date came next.
   - A dbt test keeps the derived 2026 date equal to the `key_dates` general election row.
7. **Race rating stays "Not yet available".** No source is planned (plan section 12).

## Consequences

- About 1.2 MB of CC0 data lives in the repository. Updating it is a deliberate manual step
  every two years, with a checksum that makes a silent change impossible.
- The Neon database gains roughly 12,000 contest rows once; nightly cost is two file hashes and
  one query per file.
- Opponents go stale if a nominee withdraws or a race changes after `verified_on`. Re-verify
  the seed before each general election.
- The card no longer shows a primary date as the next election. That information is on the Key
  dates card.
- `site/src/lib/model.ts` no longer reads key dates for the card, and the frontend again
  computes nothing about elections.
