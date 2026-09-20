# Verification notes

Corrections and source checks that belong with the record but arrived after the PR they
concern was merged. Newest first.

## 2026-09-20: the first deploys after PR #41 failed with HTTP 500s from the API

**What happened.** The deploy that follows the first nightly with statements (run 35479480801,
`main`) failed prerendering `/members/O000174` with `/api/v1/members/O000174/fundraising ->
HTTP 500`. The API log the workflow prints shows 25 500s in 4,832 requests, every one
`sqlalchemy.exc.TimeoutError: QueuePool limit of size 5 overflow 10 reached, connection timed
out, timeout 30.00`, and all on lightweight endpoints (`contact`, `fundraising`, `committees`)
that have nothing to do with statements. The member pages are generated last; the first big
`/statements` responses return at 02:26:17 and Ossoff's at 02:26:49, one pool wait later. The
run before #41 deployed fine.

**The first fix was not enough.** PR #44 stopped `generateMetadata` from fetching the whole
dashboard (every member page had fetched every endpoint twice) and added retries. Its deploy
(run 35485402971) failed the same way: statements requests fell from 22 to 19, the same 25 500s
came back, and the retries at 1, 3 and 9 seconds all landed inside the stall. That change was
worth keeping, but it was not the cause.

**What the database showed.** A throwaway branch sampled `pg_stat_activity` every 2 seconds
during the real build (run 35486480731, which failed identically). Normally 5 to 8 connections
are open. At 03:30:00 all **15** were `idle in transaction` (`Client/ClientRead`) at the same
moment, each on the last query of a request that had already returned it (committees, contact,
key-dates, feed, fundraising, the statements source and list), and they stayed that way, idle
for 1.2 s, then 5.5, 11.9, 16.3, 20.6, 27.0 s, until 03:30:31. Nothing was slow in the database;
zero queries were active. The API was not closing finished requests' sessions.

**Cause.** FastAPI runs an endpoint, the serialising of its response, and the cleanup of a plain
generator dependency (`session.close()`) in one pool of 40 worker threads. When many requests
cannot get a pooled connection, their threads block waiting for one, and they can take all 40.
The finished requests that hold the 15 connections then cannot get a thread to serialise their
response or close their session, so the connections are never returned, so the waiters never
get one, and nothing moves until the pool's 30 second wait expires and turns the waiters into
500s (which is also when the connections were freed). It needs a burst of requests to outrun the
pool; `/statements` made requests slow enough (2 to 6 MB reads over a link that moves about
3 MB/s, with about 90 ms round trips to Neon) that the member pages reached it. Earlier deploys
had the same latent bug with requests fast enough to stay under it.

**How it was checked.** A small deterministic reproduction (a pool of 3, a wait of 3 s, 8 worker
threads, 60 concurrent requests, each running one query):

| Session dependency | Failed requests | Time |
|---|---|---|
| As deployed (plain generator) | 56 of 60 | 21.1 s |
| Closing in a separate thread pool | 54 of 60 | 21.1 s |
| At most pool-many sessions at once, the rest wait on the event loop | 0 of 60 | 0.5 s |

The second row is a fix I tried first and rejected: closing in another pool does not help
because the response serialising also needs a worker thread.

**Fix.** `api/db.py`: `get_session` is an async dependency that admits at most
`POOL_SIZE + MAX_OVERFLOW` sessions at once. A request past that waits on the event loop holding
no thread and no connection, so a thread can never block on a checkout. The regression tests
are in `tests/api/test_db_session.py`, including a 60-request burst against a pool of 3.
Replaying the twenty member pages against the real API through a proxy that caps the database
link at 3 MB/s with 90 ms round trips, at 24 renders at once: 21 s and no failures with the fix,
against 36 s for the old code. The full suite passes (207 tests).

**What I got wrong along the way.** I first blamed the API holding a connection while sending a
large body to a slow reader (measured: it does not; the connection is returned before the body
is sent). I then blamed data volume through a slow link, and showed that a proxy at 3 MB/s and
15 ms reproduced pool timeouts under double load. That emulation used a fifth of Neon's real
latency and did not reproduce the deadlock at single load, so it could not validate the fix; a
run on the fix branch failed the same way. The `pg_stat_activity` samples are what identified
the cause.

**Measured from the runner** (run 35486272323): reading Jeffries's 4.4 MB from Neon takes 1.4 to
1.6 s (about 3 MB/s); a small endpoint takes about 0.27 s; six 2 to 4 MB statements requests at
once finish in about 1.5 s with small requests unaffected. The API still returns 2 to 6 MB per
feed member, about 90 percent of it `content_html`, of which the site keeps the first 3,000
characters; sending capped plain text would cut that about fourfold and remains worth doing.

**Still to confirm.** The fix is verified on a reproduction and a local replay, not yet on the
real deploy against Neon.

## 2026-09-19: press-feed checks behind the Public statements tab (ADR 0015)

Every feed and press URL in `dbt/seeds/statement_sources.csv` was fetched on 2026-09-19 with the
project's own user agent, and each feed's newest item compared with the newest on the office's
listing. This corrects `docs/research/public-statements-source-survey.md`, which was written the
same day and is wrong in two places:

- **Ossoff has a good feed; the survey tested the wrong URL.** `ossoff.senate.gov/feed/` is the
  generic WordPress post feed: three items, newest 2025-06-10, while his listing shows
  2026-09-18. His press releases are a custom post type with its own feed,
  `/press-releases/feed/` (ten items a page, newest 2026-09-18, full text, `?paged=N` works, 524
  items back to 2025-01-03). The survey called `/feed/` "freshest"; its sample dates (2024 and
  2025) were the clue and were not checked against the listing.
- **Ron Johnson has a feed; the survey found none.** `/category/press-releases/feed/` returns ten
  full-text items, newest 2026-09-16, matching his listing. The survey tried only `/rss.xml` and
  `/press-releases/feed/`. His press page is `/category/press-releases/`; the survey's
  `/press-releases` answers 404 to every user agent, not only bots.

So six of the twenty tracked members have a usable feed, not five; the random-sample "None" results
used a similar short list of paths and are best read as a floor (survey section 6 is updated).

Other checks that day: `robots.txt` for sanders, slotkin, ronjohnson, ossoff and speaker.gov allows
everything (speaker.gov and ossoff disallow only `/wp-admin/`); jeffries.house.gov has none (404).
All twenty press URLs load except that one. On feed paths `cotton.senate.gov/feed/` and both
`schiff.senate.gov` paths tried answer 503 (Cotton's press-release path answers 404); nothing
further was tried.

Separately, the local Docker database carries revision `0007` from the unmerged `election-context`
branch (`raw.election_return_contest`), and this branch's statements migration is also `0007`.
Whichever merges second needs renumbering, and a database that ran the other one needs
`alembic stamp 0006` before `upgrade head`. Verification here used a scratch clone.

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
