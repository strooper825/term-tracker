# Verification notes

Corrections and source checks that belong with the record but arrived after the PR they
concern was merged. Newest first.

## 2026-09-13: Phase 1f verification table (PR #9)

**What is wrong in the PR description.** The section "Every number on both members' pages,
and the mart column behind it" opens by describing two members and 42 numbers, but the table
under it covers six members and 153 numbers. The table was regenerated when the tracked
member set grew to six in the third review round; the preamble was not. Those later rounds
(`ff49af8`, `546bb7f`) were pushed after #9 had been merged at `f877dcd`, so they are on
`main` only once PR #11 merges. Read the table as the six-member one.

**Positions understated for four members.** The table shows Sanders and Slotkin with 887
positions against 890 Senate roll calls, and Jeffries and Kiley with 652 against 657 House
roll calls. The Phase 1c invariant (positions equal roll calls for a member who served the
whole Congress) was right; the local database the table was generated from was wrong. The
integration test suite upserts trimmed fixtures over live rows with the same keys, and an
earlier local test run had replaced eight live roll calls (House 1-2, 1-122, 1-240, 1-353,
2-1; Senate 1-1, 1-237, 2-1) with member lists of five or six people. Steil and Cotton are in
those fixtures, so their counts were unaffected; the four members added later were not, and
each was missing exactly the fixture roll calls in their chamber (3 Senate, 5 House). The
managed database never had fixtures loaded and was not affected.

After re-fetching those eight roll calls locally and rebuilding the mart:

| Member | Roll calls | Positions | Votes cast | Not voting | Attendance | Party unity (plan) | Party unity (CQ) |
|---|---|---|---|---|---|---|---|
| Cotton C001095 | 890 | 890 | 876 | 14 | 98.43 | 99.77 | 99.75 |
| Jeffries J000294 | 657 | 657 | 655 | 2 | 99.70 | 98.62 | 98.92 |
| Kiley K000401 | 657 | 657 | 651 | 6 | 99.09 | 93.81 | 91.48 |
| Sanders S000033 | 890 | 890 | 827 | 63 | 92.92 | 95.16 | 99.87 |
| Slotkin S001208 | 890 | 890 | 865 | 25 | 97.19 | 92.59 | 92.26 |
| Steil S001213 | 657 | 657 | 652 | 5 | 99.24 | 98.61 | 98.70 |

Two things now prevent a repeat: the test suite refuses to run its database fixtures against
a database that holds a live ingest (`tests/conftest.py`, override with
`TERM_TRACKER_ALLOW_LIVE_DB=1`), and the dbt test `assert_positions_cover_roll_calls` fails
the build when a tracked member has fewer positions than roll calls held in their chamber
during their term. Senate roll call 1-1 lists 99 senators, which is a real vacancy at the
time, not a data gap; the test counts positions per member, not members per roll call.

## 2026-09-13: source checks behind three header elements

Checked before the values stay on a public page (the data comes from
unitedstates/congress-legislators; these are the authoritative confirmations).

- **Kevin Kiley, Independent since 2026-03-09, caucusing with Republicans.** Confirmed. The
  House Clerk member page (https://clerk.house.gov/members/K000401) lists him as
  Independent, CA-3, and his House roll-call records (the Clerk's own data, via Congress.gov
  `/house-vote`) carry `R` through 2026-03-08 and `I` from 2026-03-09. Announced 2026-03-09
  and reported by the Washington Post
  (https://www.washingtonpost.com/politics/2026/03/09/kevin-kiley-house-independent/), CNN
  (https://www.cnn.com/2026/03/09/politics/kevin-kiley-independent-republican), Axios
  (https://www.axios.com/2026/03/09/republican-kiley-gop-indepedent-mike-johnson) and
  CapRadio
  (https://www.capradio.org/articles/2026/03/10/rep-kevin-kiley-says-hes-leaving-the-republican-party-and-will-serve-as-an-independent/),
  all of which say he continues to caucus with Republicans and keep his committee seats.
  Upstream is right; nothing to patch.
- **Tom Cotton, Senate Republican Conference Chair.** Confirmed current on
  https://www.senate.gov/senators/leadership.htm (119th Congress Republican leadership:
  Thune, Barrasso, Cotton as Conference Chair, Capito, Lankford, Scott).
- **Bernie Sanders, Senate Democratic Outreach Chair.** Confirmed current on the same
  senate.gov page ("Chair of Outreach: Bernard Sanders (I-VT)"), and in the Senate
  Democratic leadership announcement for the 119th Congress of 2024-12-03
  (https://www.democrats.senate.gov/newsroom/press-releases/majority-leader-schumer-announces-senate-democratic-leadership-team-for-the-119th-congress).
  The site renders the congress-legislators title verbatim ("Senate Democratic Outreach
  Chair"); senate.gov styles it "Chair of Outreach".
