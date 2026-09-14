# Research: Next Election card, opponent and prior result

Date: 2026-09-13. Branch `election-context-research`. Research only, no code. Every OpenFEC
figure below was pulled live on this date with `ingest.fec.FecClient` (51 requests in total).

## Verdict

1. **Prior result: OpenFEC cannot supply it.** It has no vote counts, and it lists who filed
   with the FEC, not who was on the ballot. Congress.gov has no election data. The House
   Clerk's *Statistics of the Presidential and Congressional Election* is the authoritative
   source, but it is published only as PDF, and text extraction pulls names and vote counts
   apart for any race with more than one candidate. **Recommended source: the MIT Election
   Data and Science Lab constituency returns**, which are compiled from the Clerk's reports:
   *U.S. House 1976–2024* (Dataverse doi:10.7910/DVN/IG0UN2, v15, 2026-03-09) and *U.S. Senate
   statewide 1976–2024* (doi:10.7910/DVN/PEJ5QU, v8, 2026-05-11). Both are CC0 TSV files with
   one row per candidate per party line.
2. **Opponent: OpenFEC cannot identify a nominee.** It records no primary outcomes, and a
   nominee who has raised under $5,000 may not appear in it at all. No receipts or committee
   filter recovers the November ballot. That is true of NY-8 today, where the Republican
   nominee is not in OpenFEC. **Recommended: a hand-maintained nominee seed** with a
   `source_url` for each row (the `key_dates` pattern), joined to FEC ids and receipts where
   they exist.
3. **Reuse: yes.** Every endpoint used is on `api.open.fec.gov/v1` and works through
   `FecClient` and its limiters, with one small fix needed (see below).
4. **Scope:** see "Proposed v1 scope". About 10 to 14 added OpenFEC requests a night (a few
   seconds) and no nightly requests for prior results.

## Shapes that differ from what the plan and code assume (plan section 11)

| # | Finding | Evidence |
|---|---|---|
| S1 | **Sanders and Slotkin are not on the 2026 ballot.** Both are Class 1, with terms ending 2031-01-03. A state-level 2026 Senate query returns *another* seat: MI `election_year=2026` gives 24 filers for Peters' open Class 2 seat, and VT gives 0. The Senate race must be keyed on the seat's election year (2030), not the cycle. | `/candidates/?office=S&state=MI&election_year=2026` |
| S2 | **Kiley is running in CA-6, not CA-3** (Prop 50 redistricting). A race keyed on the current term's district finds the wrong race. The district must come from the candidate's own `/candidate/{id}/history` row for the cycle, which gives `two_year_period 2026 → CA 06`. His FEC party is `OTH`. | `/candidate/H2CA03157/history/` |
| S3 | **`/elections/` lists filers, not the ballot.** It shows Joshua Mahony (D) as a 2020 Arkansas Senate challenger, but the Clerk shows only Cotton and Harrington (Libertarian) on the ballot. It omits John Delaney, the 2024 NY-8 Republican nominee, entirely. | `/elections/?cycle=2020&office=senate&state=AR` |
| S4 | **One person, two candidate ids.** Peter Barca (WI-1 2024: `H4WI01056`, `H4WI01197`), Jonathan Lyons (WI-1 2026), Gavin Solomon (MI 2026). | `/elections/`, `/candidates/` |
| S5 | **Primary losers look like live campaigns.** Losers in WI-1 (Burgelis, Bryce), CA-6 (Stansfield, Ho) and the Arkansas Republican primary (Ashby) still have `candidate_status=C` and quarterly-filing principal committees, weeks or months after losing. | `/candidates/`, `/committees/` |
| S6 | **Fusion and blank votes** change the share. Delaney appears on two NY lines (R 48,369 + Conservative 6,494). Vermont and NY-8 report blank and over votes inside the total. | Clerk 2024 statistics |
| S7 | `FecClient.url` calls `urlencode` without `doseq`, so a repeated parameter (`candidate_id=A&candidate_id=B` on `/committees/`) is sent as a Python list literal and returns HTTP 422. Fix: `doseq=True`. | probe run 1 |
| S8 | The Next Election date and "On the ballot" are computed in `site/src/lib/model.ts` (`buildElection`), which conflicts with plan section 7 ("the frontend computes nothing"). | code |

## 1. Prior election for each member's current seat

Clerk of the House official statistics (2024: published 2025-03-10; 2020 for Arkansas).
Vote counts are read from the PDFs, and the House rows were re-paired by hand from the
extracted text. Share A counts candidates plus write-ins/scattering; share B also counts blank
and over votes.

| Member | Race | Winner | Runner-up | Total (A) | Winner % (A) | Runner-up % (A) | Margin (A) | Margin (B) |
|---|---|---|---|---|---|---|---|---|
| Steil | WI-1, 2024 | Steil (R) 212,515 | Peter Barca (D) 172,402 | 393,493 | 54.01 | 43.81 | +10.19 pts / 40,113 | same |
| Cotton | AR Senate, 2020 | Cotton (R) 793,871 | Ricky Dale Harrington Jr. (Lib) 399,390 | 1,193,261 | 66.53 | 33.47 | +33.06 / 394,481 | same |
| Sanders | VT Senate, 2024 | Sanders (I) 229,429 | Gerald Malloy (R) 116,512 | 363,253 | 63.16 | 32.07 | +31.08 / 112,917 | +30.28 (372,885) |
| Slotkin | MI Senate, 2024 | Slotkin (D) 2,712,686 | Mike Rogers (R) 2,693,680 | 5,577,187 | 48.64 | 48.30 | +0.34 / 19,006 | same |
| Kiley | CA-3, 2024 | Kiley (R) 234,246 | Jessica Morse (D) 188,067 | 422,313 | 55.47 | 44.53 | +10.93 / 46,179 | same |
| Jeffries | NY-8, 2024 | Jeffries (D) 168,036 | John J. Delaney (R, Con) 54,863 | 223,804 | 75.08 | 24.51 | +50.57 / 113,173 | +46.93 (241,150) |

Cross-checks: the Clerk's Arkansas recapitulation total is 1,193,261 and matches the sum
above. The Vermont total of 372,885 includes blank and over votes.

Not yet verified: MIT row values against the table above. The two TSVs (4.2 MB and 0.6 MB
from dataverse.harvard.edu) have not been downloaded; that needs your approval and would be
the first step of the build.

Source comparison:

| Source | Votes | Ballot-accurate | Machine-readable | 2024 Senate | Verdict |
|---|---|---|---|---|---|
| OpenFEC `/elections/` | no (receipts only) | no (S3) | yes | yes | not usable |
| Congress.gov API | no election data | – | – | – | not usable |
| Clerk statistics | yes, official | yes | PDF only | yes | reference for verification |
| FEC *Federal Elections* compilations | yes | yes | PDF/XLSX | latest listed is 2022 | not current |
| MIT Election Lab House + Senate | yes, per party line | yes (from Clerk) | TSV, CC0 | yes (v8) | **recommended** |

## 2. Upcoming-cycle candidates (OpenFEC, 2026-09-13)

Query: `/candidates/?election_year=<seat year>&office=&state=&district=<2026 district from
candidate history>`. Receipts come from `/candidates/totals/` (two-year for House, full election
period for Senate), and committee status from `/committees/?candidate_id=…`.

| Race | Filed (incl. incumbent) | With totals | Status C | Non-incumbent, status C, receipts > 0, PCC not terminated | Actual nominee (press) | Nominee in OpenFEC? |
|---|---|---|---|---|---|---|
| WI-1 (Steil) | 14 | 8 | 7 | 6: Berman $712,984; Burgelis $54,563; Bryce $47,524; Santos $17,333; Aranda $9,800; Follmer $5,200 | Mitchell Berman (D), primary 2026-08-11 | yes, top receipts |
| AR Senate (Cotton) | 10 | 10 | 6 | 3: Shoffner $2,269,114; Ashby (R) $41,162; Wadlin (Lib) $28,778 | Hallie Shoffner (D), primary 2026-03-03 | yes, top receipts |
| CA-6 (Kiley) | 9 | 8 | 7 | 4: Pan $1,098,283; Ho $911,698; Babb Tomlinson $565,065; Stansfield (R) $17,441 | Richard Pan (D), top two 2026-06-02 | yes, top receipts, though the third-place finisher (Stansfield, 20.1%) raised $17k |
| NY-8 (Jeffries) | 6 | 3 | 3 | 1: Vance Bostic (D) $39,600 | Lewis Mizrahi (R), unopposed primary 2026-06-23 | **no**, and the filter would show a Democrat not on the ballot |
| VT Senate (Sanders) | 2030: 1 (incumbent only) | 1 | 1 | 0 | not up until 2030 | – |
| MI Senate (Slotkin) | 2030: 1 (incumbent only) | 1 | 1 | 0 | not up until 2030 | – |

What separates a real campaign from a placeholder filing:

- `candidate_status` `N` (not yet a statutory candidate, under $5,000) against `C`. Every `N`
  filer except two had zero receipts.
- Principal committee `filing_frequency` `T` (terminated): Little, Dunbar and Russell (AR);
  Guerrero, Vandenberg and DeLuz (CA-6); Osse (NY-8); Stills (WI-1).
- `has_raised_funds` false, or no `/candidates/totals` row: pure paperwork filings.
- Duplicate same-name ids (S4).

None of these separates a primary loser from the nominee.

**Proposed filter rule (for a "declared challengers" count, not for "Opponent"):**
non-incumbent; `election_year` equals the seat's next election; district from the
incumbent's candidate history for that cycle; `candidate_status = 'C'`; a principal committee
whose `filing_frequency` is not `T` or `A`; receipts > 0 in the cycle; deduplicated on the
principal committee id. Before the state's primary (`seed.key_dates`) that is a fair list of
declared challengers. After it, the list keeps primary losers (5 of 6 in WI-1, 2 of 3 in AR, 3
of 4 in CA-6) and can miss the nominee (NY-8). An **Opponent** field therefore needs nominee
confirmation that OpenFEC does not carry. The FEC's *Congressional Candidates on General
Election Ballots* list exists for 2024, but no 2026 edition is posted.

## 3. Reuse of the `fec` source

All endpoints are on `api.open.fec.gov/v1` with the same key and limits. They are
`/candidate/{id}/history/`, `/candidates/`, `/candidates/totals/`, `/committees/` and
`/elections/`; the last was probed and rejected. Reuse `FecClient`, `RateLimiter` and
`fetch_text` backoff. Two changes: `doseq=True` in `FecClient.url` (S7), and a race resolver
keyed on the candidate history row for the seat's election year instead of the current term
(S1, S2).

## 4. Proposed v1 scope

**Prior result** (all six members):

- Load the MIT House and Senate TSVs whole into `raw` (ADR 0002 pattern), refreshed by hand
  after each certified cycle. No nightly requests.
- `mart.member_prior_election`, one row per tracked member: the race won that began the
  current term; winner and runner-up names, parties, votes and shares; total; margin in points
  and votes; `source_url` to the Clerk statistics.
- Fusion lines summed per candidate. Denominator is candidates plus write-ins, excluding blank
  and over votes (share A), which needs your call.
- Kiley's row is labelled "2024, CA-3", since his next race is in a different district.
- Card text, for example: *"2024: won 54.0%–43.8% over Peter Barca (D), +10.2"*.

**Opponent** (the four seats on the 2026 ballot):

- A seed `race_nominees.csv` (member, election date, name, party, optional FEC candidate id,
  `source_url`), with a dbt test that every FEC id exists in `raw`.
- Nightly: `/candidates/totals/` for each seeded race (4 requests) to show the opponent's
  receipts beside the name, linked to the FEC page.
- Sanders and Slotkin: the card shows 2030 and "Not on the ballot in 2026". Opponent stays
  "Not yet available".
- **Race rating** stays "Not yet available".

**Supporting change in the same PR:** move next-election date, seat year and on-ballot status
into the mart (S8), using the candidate-history district, so the card computes nothing.

**Added nightly load:** 6 history requests + 4 totals requests = 10, or 14 if the declared
challengers count is also shown (4 `/candidates/` requests). The existing `fec` source makes
about 35, so the total stays under the 60-per-minute limiter with no waiting. The measured rate
was 47 requests in 11.5 s, so about 3 s added. At 535 members the per-member history call is
the part that scales; batching by state is a Phase 4 problem.

**ADR needed:** a new non-FEC source for results, a manual nominee seed, and the Class 1 and
redistricting handling of "next election".

## Decisions for you

1. Prior-result source: MIT Election Lab (recommended), or a hand seed from the Clerk PDFs.
2. Opponent: seeded nominees (recommended), FEC declared challengers, or omit.
3. Share denominator: excluding blank and over votes (recommended), or the Clerk total.
4. Whether the declared challengers count ships in v1.

## Sources

- OpenFEC API v1, https://api.open.fec.gov/developers/
- Clerk, Statistics of the Presidential and Congressional Election, 2024: https://clerk.house.gov/member_info/electionInfo/2024/statistics2024.pdf ; 2020: https://clerk.house.gov/member_info/electioninfo/2020/statistics2020.pdf
- MIT Election Lab, U.S. House 1976–2024: https://doi.org/10.7910/DVN/IG0UN2 ; U.S. Senate statewide 1976–2024: https://doi.org/10.7910/DVN/PEJ5QU
- FEC election results page: https://www.fec.gov/introduction-campaign-finance/election-results-and-voting-information/
- WI-1 nominee: https://wisconsinexaminer.com/2026/08/11/berman-wins-democratic-nod-to-challenge-steil-in-wisconsins-1st-district/
- AR Senate nominee: https://arkansasadvocate.com/2026/03/03/shoffner-cotton-win-primaries-for-u-s-senate-seat-in-arkansas/
- CA-6 top two: https://www.cbsnews.com/sacramento/news/california-congressional-district-6-primary-election-2026/ ; Kiley district choice: https://calmatters.org/politics/2026/03/kevin-kiley-chooses-reelection-district/
- NY-8 primaries: https://www.nbcnews.com/politics/2026-primary-elections/new-york-us-house-district-8-results
