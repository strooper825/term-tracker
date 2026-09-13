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
for every row of `tracked_members`.

## Tests

```bash
npm test          # vitest: "given this mart row, this text renders"
npm run typecheck
```

## Deploy

The nightly workflow builds after `dbt build` and deploys the prebuilt output with the Vercel
CLI (`vercel build`, `vercel deploy --prebuilt`) using the `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and
`VERCEL_PROJECT_ID` secrets. Vercel's Git integration is not used.
