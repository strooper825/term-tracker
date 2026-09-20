# 0017. The deployment ships pages, not prefetch payloads

Date: 2026-09-20
Status: Accepted

## Context

Two hosting allowances were nearly spent on the same day, and both were measured before anything
was changed.

**Vercel deployment storage: 8.87 GB of the 10 GB Hobby allowance**, with repeated warnings. The
figure is the sum of the **unpacked** deployments retained, not what the upload weighs: 35
successful deploys in 30 days at about 495 MB each is roughly 9 GB, which matches. The upload
itself is only 55 MB, because `--archive=tgz` compresses it, so the upload size had been the
number watched and it was the wrong one.

**GitHub Actions: 1,838 of 2,000 minutes**, 11 days before the reset. Measured per job over the
billing cycle:

| Workflow | Runs | Minutes |
|---|---|---|
| `ingest.yml` | 26 | 1,243 |
| `ci.yml` | 102 | 358 |
| `deploy.yml` | 24 | 190 |
| `nightly.yml` (since deleted) | 16 | 174 |

One scheduled nightly costs 58 minutes: 40 in the ingest step (Congress.gov's 5,000 requests an
hour is the binding constraint while every bill's detail record is re-fetched) and 12 building
the site. At 30 nights that is 1,740 minutes, 87 percent of the allowance before a single pull
request. The month also carried 832 minutes of manual ingest dispatches, but the baseline alone
does not fit.

**What the 495 MB is.** Bill pages are 432 MB of it (87 percent) and member pages 62 MB. Next 16
writes four React Server Component payload files beside every exported page, so that a `<Link>`
can navigate without a page load: `<route>.txt`, and under `<route>/` the files
`__next._full.txt`, `__next._tree.txt` and `__next.<segment>/.../__PAGE__.txt`. H.R. 1 ships as a
533 KB page plus three near-identical 236 KB payloads. Across the build the payloads are 307 MB
of 495 MB and 18,464 of 23,102 files, and they duplicate data the HTML already carries.

`prefetch = 'force-disabled'` (the route segment config) does not help: it requires
`cacheComponents`, which this site does not use.

## Decision

**The payload files are deleted after the build and before the upload**
(`site/scripts/strip-prefetch-payloads.mjs`, run by `deploy.yml` and by `ci.yml`). Client-side
navigation falls back to an ordinary page load. For a site of static, individually linkable
records that is an acceptable trade for 62 percent of the deployment.

A `.txt` is removed only when it is a payload: either its name begins with `__next.` (or it sits
under such a directory), or the page it belongs to is beside it, so `bills/119/hr/1.txt` goes
while a `robots.txt` with no `robots.html` stays. Directories a payload left empty are removed.
The step is idempotent, so re-running the build step changes nothing.

It runs **before** the static check, so `check-static.mjs` reads only what actually ships.

**Every deploy records its own size** in the run summary: payloads dropped, pages, files and
unpacked bytes. The upload size was visible before and the deployment size was not, which is why
this went unnoticed until the allowance was nearly gone.

**Every deploy also records the function output.** Vercel reported 3.13 GB of function storage
for this project, and a static export should produce none; nothing in the repo accounts for it,
so `.vercel/output/functions` is listed on each run until the cause is known.

## Consequences

- The deployment falls from about 495 MB to about 188 MB and from 23,102 files to about 4,640.
  At the retention now set (production 2 weeks, everything else 1 week) a nightly cadence
  retains roughly 2.6 GB rather than 6.9 GB.
- **Navigation is a page load, not an instant transition.** Verified on a real build before
  committing to it: with every payload deleted, links navigate, pages render whole, the member
  dashboard's tabs still hydrate and switch, and the console is clean. What is lost is the
  prefetch, nothing else.
- The site keeps its client components, so `output: 'export'` and the thin-frontend rule of
  PLAN.md section 7 are unaffected. This is a decision about what the build ships, not about
  where figures are computed.
- **The Actions allowance is a separate fix**: the repository is being made public, which makes
  Actions minutes free and unmetered. No secret was ever committed (only `.env.example` is
  tracked, `.env` is ignored, and a scan of all 131 commits found nothing key-shaped), so the
  history does not need rewriting first. Without that change a nightly cadence does not fit.
- **The root cause is untouched.** 4,592 bill pages drive the 40-minute ingest, the 12-minute
  build and 87 percent of the deployment. PLAN.md section 12 already records that bill coverage
  needs a hosting or output decision; this ADR buys room, it does not settle that. The two
  measures that would: making the ingest incremental (ask Congress.gov which bills changed
  rather than re-reading all of them), and not giving every cosponsored bill a full page.
