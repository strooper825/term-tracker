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

Routes: `/members` (index; `/` redirects to it on Vercel via `vercel.json`), `/members/{bioguide}`
for every row of `tracked_members`, and `/bills/{congress}/{type}/{number}` for every row of
`mart.bill` (about 1,900 pages). Bill pages are reached from the bill number in any activity
feed row; there is no bill index yet, and bill search is an open item in plan section 12.

## Tests

```bash
npm test          # vitest: "given this mart row, this text renders"
npm run typecheck
```

## Deploy

`.github/workflows/deploy.yml` builds the site and deploys the prebuilt output with the Vercel
CLI (`vercel build`, `vercel deploy --prebuilt --archive=tgz`) using the `VERCEL_TOKEN`,
`VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` secrets. Vercel's Git integration is not used. The
nightly ingest calls it after `dbt build`; dispatch it on its own (Actions tab,
`deploy_target` auto, preview, or production) to publish a frontend change without an ingest.

`--archive=tgz` uploads the output as one tarball. Since the bill pages landed, the export is
9,435 files (one HTML page plus four prefetch payloads per route across 1,884 pages) and the
free tier refuses a deployment of more than 5,000 files. `vercel build` has no archive flag
and needs none: it only writes `.vercel/output` locally. Plan section 12 records what this
means for bill search.
