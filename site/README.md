# Term Tracker site

Next.js + Tailwind, statically generated from the Phase 1d API at build time and deployed as
prebuilt output. No runtime server, no client-side data fetching: every number on a page is a
mart column read through the API when `next build` runs (see `src/lib/api.ts` and
`src/lib/model.ts`). The visual target is `../design/`.

## Build

```bash
npm ci
API_BASE_URL=http://127.0.0.1:8000 npm run build   # needs the API running against a mart
node scripts/check-static.mjs out                  # fails if the output could reach the API
```

Routes (ADR 0022 for the homepage and sections):

- `/`: the homepage. Search, the national map of who holds every seat (`GET /congress/seats`
  plus the shapes in `public/maps/national.json`, made by `python -m ingest.national_map`), and
  the latest articles.
- `/members`, `/members/{bioguide}` for every row of `tracked_members`, `/congress`, and
  `/bills/{congress}/{type}/{number}` for every row of `mart.bill`.
- `/search`, plus `/search/members.json` and `/search/bills.json` (static route handlers the
  search box fetches on first use).
- `/articles`, `/articles/{slug}`, `/about`, `/methodology`, `/privacy`, `/support`, and
  placeholders for the sections still to come: `/elections`,
  `/elections/{presidential,senate,house,governor}` and `/states` (listed in `src/lib/sections.ts`).

## Words the owner edits

Everything that is not data lives in `content/`: `site.json` (homepage headline and intro,
footer mission, Ko-fi address, contact email, social links), `pages/*.md` and `articles/*.md`
(see `content/articles/HOW-TO-WRITE-ARTICLES.txt`). Edit them in the browser at `/admin` (Sveltia CMS, signed in
with a GitHub personal access token that can write to this repository) or by hand. A push to
`main` that only touches `content/` or `public/uploads/` deploys the site on its own.

## Tests

```bash
npm test          # vitest: "given this mart row, this text renders"
npm run typecheck
```

## Deploy

`.github/workflows/deploy.yml` re-derives the mart with `dbt build` (no ingest), builds the
site, and deploys the prebuilt output with the Vercel
CLI (`vercel build`, `vercel deploy --prebuilt --archive=tgz`) using the `VERCEL_TOKEN`,
`VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` secrets. Vercel's Git integration is not used. The
nightly ingest calls it after `dbt build`; dispatch it on its own (Actions tab,
`deploy_target` auto, preview, or production) to publish a frontend change without an ingest.

`--archive=tgz` uploads the output as one tarball. Since the bill pages landed, the export is
9,435 files (one HTML page plus four prefetch payloads per route across 1,884 pages) and the
free tier refuses a deployment of more than 5,000 files. `vercel build` has no archive flag
and needs none: it only writes `.vercel/output` locally. Plan section 12 records what this
means for bill search.

The `dbt build` matters because the API the build reads is the same commit's code: a branch
that adds a mart column and selects it would otherwise render against the mart the last
nightly left behind and get a 500 on every page that touches it. A page render only sees an
HTTP status, so the workflow prints the API's log whenever the build fails.
