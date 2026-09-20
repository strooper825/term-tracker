# Public statements source survey

Date: 2026-09-17
Status: Research only — no ingestion code written. This answers the five questions posed for
panel 9 (docs/PLAN.md); it is not an ADR because no decision is made here, only a
recommendation for whoever scopes the build.

> **Corrected 2026-09-19, when the feeds were built against.** Two rows below were wrong and are
> fixed in place: Ossoff's press feed is `/press-releases/feed/` (the `/feed/` this survey tested
> is a stale generic post feed), and Ron Johnson has a working feed at
> `/category/press-releases/feed/` and a press page at `/category/press-releases/` (not
> `/press-releases`). Six tracked members, not five, have a usable feed: Sanders, Slotkin, Ossoff,
> R. Johnson, Jeffries and the Speaker. The full-535 estimate in section 6 is a floor for the same
> reason: the probes tried only a short list of feed paths. `dbt/seeds/statement_sources.csv` and
> ADR 0015 are authoritative; details in `docs/verification-notes.md`.

## Why this exists

Panel 9 ("Public statements") has shipped as a locked placeholder since Phase 1f
(`site/src/components/SideCards.tsx`, `LockedPanels`). X/Twitter's API has no free tier as of
2026 (pay-per-use only), and Meta's Graph API requires App Review to read a Page the requester
doesn't own and is considered fragile for a nightly unattended job. This survey checks whether
official House/Senate press-release pages — .gov sources we already trust for votes and bills —
can substitute, following the same pattern as `ingest/sources/congress_gov.py` and
`ingest/sources/senate_votes.py`: a per-source client, idempotent upsert on a natural key, and
`meta.ingest_run` provenance.

Every row below reflects a direct fetch (not a search-result summary) of the live press page,
its feed if any, and its `robots.txt`, on 2026-09-17.

## Verdict, one line

**14 of the 20 tracked members can be covered by a single shared RSS/Atom parser today; 9 more
would need a per-member HTML scraper; 1 (McConnell) has told crawlers not to.** The Congressional
Record (already an ingested source family, via the same Congress.gov API key) adds floor-remarks
text with no new source, but the member attribution is unstructured surname text, not a field —
worth a second phase, not part of the same PR as the press-release feeds.

## 1. Per-member verdict

| Member | Bioguide | Chamber | Category | Feed / listing URL | Notes |
|---|---|---|---|---|---|
| Bryan Steil | S001213 | House WI-1 | Feed exists, needs filtering | `steil.house.gov/rss.xml` | Sitewide Drupal feed, not scoped to press releases (mixes in "Storm Response Resources" etc.), no `category` field, not strictly chronological |
| Tom Cotton | C001095 | Senate AR | Structured HTML | `cotton.senate.gov/news/press-releases` | Feed endpoints return 503 (deliberately disabled, not merely absent); clean paginated card list, 93 pages |
| Bernie Sanders | S000033 | Senate VT | **RSS feed, clean** | `sanders.senate.gov/press-releases/feed/` | Dedicated press feed; full text via `content:encoded` |
| Elissa Slotkin | S001208 | Senate MI | **RSS feed, clean** | `slotkin.senate.gov/category/press-releases/feed/` | Cleanest feed found: title, dated permalink, category, full `content:encoded` |
| Kevin Kiley | K000401 | House CA-3 | Structured HTML | `kiley.house.gov/media` | `/feed/` 301s to an admin subdomain that doesn't resolve publicly — no accessible feed; static HTML card list is clean |
| Hakeem Jeffries | J000294 | House NY-8 | **RSS feed, clean** | `jeffries.house.gov/feed/` | Full text via `content:encoded`; no `robots.txt` on the domain (default allow) |
| Rick Crawford | C001087 | House AR-1 | Feed exists, needs filtering | `crawford.house.gov/rss.xml` | Sitewide feed (forms, tours mixed in with releases) |
| Ron Johnson | J000293 | Senate WI | **RSS feed, clean** | `ronjohnson.senate.gov/category/press-releases/feed/` | Corrected: full text, ten items a page, newest matches the listing at `/category/press-releases/`. The first pass found no feed and used `/press-releases`, which 404s for every client |
| Tammy Baldwin | B001230 | Senate WI | Structured HTML | `baldwin.senate.gov/news/press-releases` | No feed (site pushes an email signup instead); ~180 pages, clean |
| Mitch McConnell | M000355 | Senate KY | **Blocked — do not automate** | `mcconnell.senate.gov/public/index.cfm/pressreleases` | `robots.txt` disallows all crawlers except a narrow `gsa-crawler` carve-out that itself excludes RSS/feed URL patterns; legacy ColdFusion template, no feed anyway |
| Mark Pocan | P000607 | House WI-2 | Feed exists, unusable | `pocan.house.gov/rss.xml` | Returns stale carousel/banner content, not press releases (duplicate 2022 items); HTML listing is the real source here |
| Jon Ossoff | O000174 | Senate GA | **RSS feed, clean** | `ossoff.senate.gov/press-releases/feed/` | Full text via `content:encoded`, newest item matches the listing (corrected: the first pass tested `/feed/`, a stale generic post feed) |
| John Boozman | B001236 | Senate AR | Structured HTML | `boozman.senate.gov/public/index.cfm/press-releases` | No feed; legacy ColdFusion, 257 pages, plain table |
| Chris Murphy | M001169 | Senate CT | Structured HTML | `murphy.senate.gov/newsroom/press-releases` | No feed; card list with filters, clean |
| Adam Schiff | S001150 | Senate CA | Structured HTML | `schiff.senate.gov/newsroom/press-releases/` | No feed; card list, `robots.txt` fully open |
| Thomas Massie | M001184 | House KY-4 | Structured HTML | `massie.house.gov/news/` | No feed; legacy ASP.NET template (`documentquery.aspx`), consistent fields |
| Ro Khanna | K000389 | House CA-17 | Feed exists, stale | `khanna.house.gov/rss.xml` | Sitewide, not press-scoped, **and** its most recent item trails the live listing by over a year — do not trust its freshness |
| Alexandria Ocasio-Cortez | O000172 | House NY-14 | Feed exists, stale | `ocasio-cortez.house.gov/rss.xml` | Same pattern as Khanna: sitewide, stale relative to the live page |
| Mike Johnson | J000299 | House LA-4 (Speaker) | **Two sites — see below** | `speaker.gov/feed/` (clean) + `mikejohnson.house.gov/media/press-releases` (HTML, no feed) | Speaker's official site has a rich, fresh, full-text feed; his House member site does not |
| Scott Perry | P000605 | House PA-10 | Structured HTML | `perry.house.gov/news/documentquery.aspx?DocumentTypeID=2608` | No feed; same legacy ASP.NET template as Massie |

## 2. Are the feeds consistent across offices? No — two distinct families

**WordPress Senate/leadership sites** (Sanders, Slotkin, Ossoff, Jeffries, speaker.gov) give a
proper RSS 2.0 document scoped to press releases, with `title`, `link`, `pubDate`, `guid`,
`dc:creator`, usually `category`, and — the one that matters most — **`content:encoded` carrying
the full release text**, not an excerpt. These need no scraping fallback at all.

**Drupal House-office sites** (Steil, Crawford, Pocan, Khanna, Ocasio-Cortez, and Kiley's admin
subdomain) all share the same template, evident from identical `robots.txt` boilerplate
(`/admin/`, `/core/`, `/search/`, `/media/oembed` disallowed) across otherwise unrelated members.
Their `/rss.xml` is a sitewide construct that predates the press-release content type: no
`category` field, only a short HTML `description` (no full text), and no guarantee of scope or
freshness — two of six (Khanna, AOC) are visibly stale, one (Pocan) returns the wrong content
entirely.

**Legacy templates with no feed at all**: ColdFusion (`index.cfm`) on the Senate side (Cotton,
Boozman, McConnell) and an older ASP.NET `documentquery.aspx` template on the House side (Massie,
Perry, and Mike Johnson's own member page). All three still render as clean, non-JS, paginated
HTML, so they're scrapeable, just not feed-able.

There is no single schema that covers all offices. A v1 ingester needs (a) a generic RSS/Atom
parser for the WordPress family, used as-is for 5 members and with a path/category filter plus a
freshness sanity check for 5 more, and, if scraping is ever built, (b) per-member HTML selectors
for the rest — exactly the "worth flagging as higher-maintenance" case the plan anticipated.

## 3. Congressional Record: remarks without a new source, but not a clean join

Congress.gov already exposes this (verified live against `api.congress.gov/v3`, same
`CONGRESS_GOV_API_KEY` and rate limiter the bill/vote sources use):

- `GET /v3/daily-congressional-record` lists issues (volume, issue number, date) — no member
  data, just an index.
- `GET /v3/daily-congressional-record/{volume}/{issue}/articles` lists articles per section
  (`Daily Digest`, `Extensions of Remarks Section`, `House Section`, `Senate Section`), each with
  a `title` and links to a "Formatted Text" HTML page and a PDF. **No bioguide ID, no structured
  speaker field anywhere in this response.**
- Fetching an actual formatted-text page (`www.congress.gov/119/crec/.../modified/CREC-...htm`)
  returns plain text in a `<pre>` block. Two attribution styles were found, pulled live on
  2026-09-17:
  - Floor debate/procedural entries: bare surname call-outs, e.g. `Offered By Mr. Jordan`,
    `Mr. CRAWFORD. Mr. Speaker, I rise today...` — chamber context (House Section vs. Senate
    Section) narrows it, but surname alone is ambiguous whenever two members share one: **two
    tracked members are named Johnson (Ron Johnson, Senate WI; Mike Johnson, House LA)**, and the
    House has other untracked Johnsons who would also read as `Mr. JOHNSON` in a House Section
    transcript.
  - Extensions of Remarks: a header block naming the member in full, e.g.
    `HON. ERIC A. "RICK" CRAWFORD of arkansas` (pulled verbatim from
    `CREC-2026-09-14-pt1-PgE914-2.htm`, a tribute to Arkansas truck drivers) — this resolves the
    collision problem, but the content skews toward ceremonial tributes and recognitions rather
    than the newsy statements panel 9 wants, and it's still free text to parse, not a field.

**Verdict:** this is real content, reachable with zero new infrastructure, but it answers a
different question than "press releases." It would need its own small parsing layer (name +
chamber matching, explicit exclusion of ambiguous surnames) and a decision about whether
ceremonial Extensions of Remarks count as a "public statement" for this panel. Recommend treating
it as a second, later addition to panel 9 (the plan already lists "floor speeches (Congressional
Record)" as a separate source alongside "Official site RSS"), not bundled into the RSS-feed v1.

## 4. Access and rate limits: checked, not assumed

- **Only one office actively blocks crawling**: McConnell's `robots.txt` disallows `/` for all
  user agents except a `gsa-crawler` exception scoped to `/public/` that itself excludes
  `*RSS.Feed`/`*Rss.Feed` patterns. That is the site owner's explicit statement; recommend
  excluding him from automated collection entirely rather than working around it.
- Every other office's `robots.txt` either has no relevant `Disallow` (most: fully open, or only
  blocks admin/search/login paths that a press scraper never touches) or doesn't exist at all
  (defaults to allow). **None of the 19 remaining sites declare a `Crawl-delay`.**
- `www.congress.gov` (relevant only if the Congressional Record HTML pages are ever fetched
  directly, not through the API) disallows a long named list of AI/scraper user agents
  (`ClaudeBot`, `Claude-User`, `anthropic-ai`, `OpenAI`, `PerplexityBot`, and dozens more) from the
  entire site, but leaves the generic `User-agent: *` bucket open except for `/search`,
  `/account`, `/lac`, with `Crawl-delay: 2`. This project's existing user agent
  (`ingest/http.py`: `term-tracker/0.1 (+https://github.com/strooper825/term-tracker)`) is not one
  of the named bots and identifies itself honestly, so it is not caught by that block — but it's
  worth keeping that user-agent string as-is (not spoofing a browser) precisely because it keeps
  the ingest legible to whoever reads congress.gov's own robots.txt later.
- No terms-of-use language prohibiting automated collection was found on any official
  `.house.gov` or `.senate.gov` site (content there is government work product, not copyrighted).
  Campaign sites with similar names (e.g. `adamschiff.com`, `chrismurphy.com`) were not checked
  and are out of scope — we only want the official office sites.
- One soft flag: Ron Johnson's site returned intermittent 404s on repeated fetches of the same
  press-release listing page during this survey. Not a block, but worth a resilience check
  (retry, or confirm it's not bot-fingerprinting) before relying on it nightly.

## 5. Recommended v1 scope

**Tier 1 — ingest now, one shared RSS/Atom parser (5 members, both chambers):** Sanders
(S000033), Slotkin (S001208), Jeffries (J000294), Ossoff (O000174), Mike Johnson via
`speaker.gov` (J000299). All have dedicated, fresh, full-text feeds. This is the "at least 5
members across both chambers" real sample the investigation asked for — 3 Senate, 2 House
(Jeffries + the Speaker's office feed).

**Tier 2 — same parser, plus a filter and a freshness guard (5 members):** Steil (S001213),
Crawford (C001087), Pocan (P000607), Khanna (K000389), Ocasio-Cortez (O000172). The mechanism
doesn't change — it's the same RSS parser — but each needs a path/title filter to isolate press
releases from the sitewide feed, and Khanna/AOC specifically need a staleness check (their feed's
own dates already lag the live page by over a year) rather than trusting the feed blindly.
Recommend building Tier 1 first, then re-verifying Tier 2's freshness right before the build
lands, since a CMS update between now and then could fix or worsen it.

**Tier 3 — no feed, would need a per-member HTML scraper (9 members, defer or do by hand):**
Cotton (C001095), Kiley (K000401), Ron Johnson (J000293), Baldwin (B001230), Boozman (B001236),
Murphy (M001169), Schiff (S001150), Massie (M001184), Perry (P000605). Every one of these has a
stable, non-JS, consistently structured listing — scraping is *feasible* — but it's nine separate
selector sets instead of one shared parser, each one a maintenance liability the day any of these
nine offices redesigns its site. This matches the plan's own instinct (docs/PLAN.md, "Open
items": "Expanding tracked members in batches... needs a batching plan") and the precedent already
set for `seed.key_dates` (hand-maintained where automation isn't worth it). Recommend deferring
to a second PR, scoped separately, rather than bundling with Tier 1/2.

**Tier 4 — do not automate (1 member):** McConnell (M000355). `robots.txt` says not to. If his
statements matter enough for the site, treat him like `seed.key_dates`: a manually maintained
seed, not a crawler.

**Coverage:** Tier 1+2 alone gets 14 of 20 tracked members a real, low-maintenance statements
panel. Adding Tier 3 later would bring it to 19 of 20 (McConnell excepted by his own robots.txt),
at roughly triple the code (one parser vs. one parser + nine scrapers).

**Nightly cost estimate (Tier 1+2, i.e. v1 as scoped above):** 10 GET requests per night, one per
feed, each returning the last 10–50 items; new-guid-only upsert (matching the existing
idempotent-upsert pattern in `ingest/load.py`) means steady-state nights fetch the same 10 URLs
and insert only what's new. Total runtime: well under a minute including parsing — trivial next
to the nightly job's existing ~1,900 Congress.gov bill-detail requests and its 180-minute budget
(`.github/workflows/ingest.yml`). If Tier 3 is added later: roughly +9–18 requests/night (one or
two per member, since only the first listing page needs checking for anything posted since the
last run), still small against the current nightly footprint.

## 6. Extrapolating Tier 1 to the full 535 (2026-09-17 addendum)

The intended UI splits by tier: Tier 1 gets a scrolling, searchable feed (full text, so it's
worth searching over and worth trusting as "live"); everything else gets a link-out to the
official press page rather than a half-built panel. That makes "how many of the 535 are Tier 1"
the number that actually sizes the feature, not just the 20 tracked members. Two things had to be
checked before answering: whether the crowdsourced `congress-legislators` YAML's `rss_url` field
(the source this pipeline already ingests, `raw.legislator.payload`) could stand in for a live
check, and, since it couldn't, what a real random sample says.

**The `rss_url` field is not usable as a shortcut.** Parsed directly from
`legislators-current.yaml` (539 current members, the same file `ingest/sources/legislators.py`
loads): 159 of 539 (124 House, 35 Senate) have a non-empty `rss_url` in their current term. But
checking it against the 20 tracked members we'd already verified live showed it has no
predictive value: McConnell's listed URL (`.../public/?a=rss.feed`) is the exact pattern his
`robots.txt` now excludes and 404s; Murphy's listed URL is a 2012 news article on
`theday.com`, not his own site; and it's silent (`None`) for Slotkin, Ossoff, and Mike Johnson's
speaker.gov feed — three of our five cleanest, freshest, currently-working feeds. The field
reflects whatever a contributor found whenever they last edited that member's entry, which for
many offices predates their current CMS by years. **Every candidate needed a live fetch; there
was no way to shortcut this with existing data.**

**Method.** Drew a reproducible random sample (Python `random.seed(20260917)`) of 20 Senators and
25 Representatives from the 515 untracked members, stratified by chamber only (the `rss_url` flag
turned out not to correlate with anything, so stratifying on it would have been misleading). Four
agents live-checked all 45 — official press page, common feed paths, and for any feed found,
full-text (`content:encoded`) presence and freshness against the live listing — using the same
three-way classification as the main survey plus a "Flawed" middle tier for feeds that exist but
fail on scope, staleness, or emptiness.

**Results**, combined with the 20 already verified (65 members checked total, ~12% of Congress):

| | Clean (Tier 1) | Flawed | None | n |
|---|---|---|---|---|
| Senate | 6 (20.0%) | 4 | 20 | 30 |
| House | 2 (5.7%) | 19 | 14 | 35 |
| **Total** | **8 (12.3%)** | 23 | 34 | 65 |

Weighted by actual chamber size (100 Senate, 435 House): **Senate ≈ 20 of 100, House ≈ 25 of 435,
for roughly 45 of 535 (≈8%) meeting the Tier 1 bar today.** Sample sizes are modest enough that
the honest range is wider — call it **35–70 members (7–13%)** rather than a point estimate; the
Senate figure in particular rests on only 30 observations.

**The tracked 20 overstate the rate — don't use it to size the feature.** The tracked list's
implied Tier 1 rate (2 of 10 House members, both leadership: Jeffries, the Speaker) is more than
triple the random-sample House rate (5.7%). Leadership and other high-profile offices run better
comms infrastructure than a typical seat; a v1 built only against the tracked 20 would look more
feed-friendly than Congress actually is.

**Two more flaw modes showed up at this scale**, beyond the stale/sitewide/wrong-content ones the
main survey found:
- **Structurally valid but empty**: Schmitt's and Lankford's Senate feeds parse as RSS 2.0 with a
  `content` namespace declared, but contain zero `<item>` elements — worse than stale, since a
  naive nightly job would read "office posted nothing" rather than "feed is broken."
- **Wrong content type entirely**: Subramanyam's `/rss.xml` is a photo-gallery feed; Onder's is a
  newsletter feed. The URL pattern that works for one office's press releases is a different
  content type for another's, even on similar-looking sites.

**Update 2026-09-19.** With Ron Johnson moved from None to Clean, the Senate row reads 7 of 30
(23 percent) and the total 9 of 65 (14 percent); weighted by chamber size that is about 23
senators and 25 representatives, roughly 48 of 535 (9 percent). Treat every figure here as a
floor: the sample probes tried `/feed/`, `/rss.xml` and a few press paths, and missed both of
the custom feed paths above, so some "None" offices likely have a feed at a path nobody tried.

**Good news for the link-out plan**: most of the "None" members (11 of 14 in the House sample, 13
of 20 in the Senate sample) have clean, fresh, actively-maintained press pages — they simply don't
expose a feed at any common path. Linking to those pages for everyone outside Tier 1 isn't a
fallback to a worse source, it's linking to the same quality of official page Tier 1 members have,
just not in a machine-readable shape. That supports scoping the UI exactly as proposed: a real
scrolling/searchable feed for the ~45 Tier 1 members, a plain link-out for the rest, and no
attempt to force Tier 2/3 data into the same feed component.

## What this survey did not re-litigate

X/Twitter (no free API tier as of 2026) and Meta/Facebook's Graph API (App Review required to
read a Page the requester doesn't own, and considered fragile for an unattended nightly job) were
ruled out before this investigation started; this survey only checked whether official .gov press
pages are a viable substitute, and found that for 14–19 of the 20 tracked members, they are.
