# 0015. Public statements: official press feeds from a hand-verified seed, link-out for everyone else

Date: 2026-09-19
Status: Accepted

## Context

docs/PLAN.md lists panel 9, "Public statements", with the source "Official site RSS,
GovInfo". X/Twitter has no free API tier and Meta's Graph API needs App Review, so the
official .gov press pages are the source. docs/research/public-statements-source-survey.md
checked them for the 20 tracked members and a random 45 more. What it found, and what the
build re-verified on 2026-09-19 before writing this:

- **Feed quality varies by office, not by chamber.** A usable feed is press-scoped, carries
  the full text in `content:encoded`, and is as fresh as the office's own listing. Sanders,
  Slotkin, Ossoff, Ron Johnson, Jeffries and speaker.gov (the Speaker's office) meet that bar.
  Most House offices publish only a sitewide `/rss.xml` that mixes press releases with pages,
  galleries and newsletters, carries an excerpt only, and is often years stale.
- **The feed URL is not guessable.** Ossoff's press feed is `/press-releases/feed/`; his
  generic `/feed/` is a valid but year-old WordPress post feed, and the first survey pass
  rated him on that one. Ron Johnson's is `/category/press-releases/feed/`, which the survey
  missed by probing only `/rss.xml`. `rss_url` in congress-legislators, already ingested, is
  stale or wrong for most members, so it cannot supply the URL either.
- **A feed can be valid and wrong.** Feeds seen in the wild were empty (zero items), stale,
  sitewide, or a different content type (photo gallery, newsletter).
- **Feeds page.** The WordPress feeds accept `?paged=N`, ten items a page (Sanders six), so
  history can be back-filled without scraping.
- **One office says no.** McConnell's robots.txt disallows all crawlers.
- **The press-page URL for a link-out must be checked too.** Ron Johnson's `/press-releases`
  404s; the page is `/category/press-releases/`.

## Decision

1. **A seed decides who gets a feed.** `seed.statement_sources` (`dbt/seeds/statement_sources.csv`)
   has one row per tracked member: `mode` is `feed` or `link`; `press_url` is the office's
   own press-release listing (checked to load, for both modes); `feed_url` is set for `feed`
   rows only. A member is `feed` only when a person has checked, on the seed date, that the
   feed is press-scoped, has full text, and its newest item matches the newest on the
   listing. Everything else is `link`. Adding a member to the feed tier is a seed change,
   made by hand, not something the ingest discovers.
2. **`ingest.sources.statements`** (source name `statements`) reads the `feed` rows and loads
   `raw.statement`, keyed `(bioguide_id, guid)`, payload the parsed item (title, link, guid,
   pubDate, creator, categories, description, `content:encoded`) as JSONB. XML is parsed with
   xmltodict, as the Senate votes are; nothing is cleaned in Python (plan principle 2).
3. **Paging.** Page 1 is always read. The loader keeps paging (`?paged=N`) until a page is
   empty or 404s, the oldest item on it predates the tracked Congress (2025-01-03), or, on a
   normal night, the page holds an item already stored (everything older is stored too).
   `--full-refresh` ignores the stored-item stop. A first load costs roughly one request per
   ten statements in the Congress; a normal night costs one request per feed.
4. **Failure handling is per feed.** A transport failure (timeout, 5xx after retries, 404 on
   page 1) skips that feed with a warning and leaves its stored rows; an empty page 1 does the
   same. A document that is not RSS, or a page on which no item has a title, link and
   date, raises `SourceShapeError` and stops the run, as the plan requires for a changed
   shape. A single unusable item is skipped with a warning instead: Jeffries's history holds
   an untitled item from 2025-05-23, and one bad item from years back must not fail every
   night. The run fails only if every feed failed. The source is registered last so a failure cannot hold up
   the vote and bill sources. A dbt `warn` test names any feed whose newest statement is over
   45 days old, which is how a silently dead feed shows up.
5. **Mart.** `mart.statement` (one row per statement; `content_html` verbatim, sanitised and
   turned into text by the site at build time, as the CRS summaries are) and
   `mart.statement_source` (one row per tracked member: mode, links, counts, newest date).
   `GET /api/v1/members/{id}/statements` returns `mode` `feed`, `link`, or `none`.
6. **The tab.** `feed` members get a searchable, scrolling list of their statements, each
   linking to the official page; `link` members get a plain link to the office's press page.
   A member with no seed row keeps the "Soon" tab. Search runs in the browser over title,
   categories and full text, which are embedded at build time as the vote list is.
7. **Politeness.** One request a second, the project's own honest user agent
   (`term-tracker/0.1 (+repo URL)`), and a fetch of a URL only if the domain's robots.txt does
   not disallow it (checked 2026-09-19 for sanders, slotkin, ronjohnson, ossoff, speaker.gov;
   jeffries.house.gov has no robots.txt). The seed note records the check.

## Consequences

- Six of the twenty tracked members get the feed on day one; the other fourteen link out. The
  next tracked members to add each need a person to find and check a feed, which is the price
  of not showing a stale or wrong one.
- A feed that goes stale or empty degrades quietly: the site keeps showing what it has, and the
  dbt warning is the alert. A feed that changes shape fails the night loudly.
- Page weight is the cost of in-browser search on a static site. Each release's plain text is cut
  at 3,000 characters (the median is about 2,500); measured on the 2026-09-19 build, the six feed
  members' pages run from 0.85 MB (R. Johnson, 117 releases) to 2.3 MB (Jeffries, 700; 547 KB
  gzipped), against about 0.5 MB for a link-out member. Search covers the title, topics and that
  much text, and the tab says so. Raw storage is about 1.6 MB per feed member (9.8 MB for six).
  `next build` logs "items over 2MB can not be cached" for the two largest statements responses;
  that only skips the build's own fetch cache.
- Only what an office publishes after the tracked Congress began is shown; a feed that pages
  back less far than that simply holds fewer statements.
- The tab shows press releases only. Floor remarks (the Congressional Record) are a separate
  source with unstructured speaker attribution (survey section 3) and are not part of this.
- Statements are reproduced from the offices' own feeds and link back to them. They are the
  members' words, not this site's, and the tab says so.
