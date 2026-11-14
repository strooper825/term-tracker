// Writes each race's holder into an election file, for the races that have none of their own
// (ADR 0024). Run once per Senate map when its Congress ends, before the seat data rolls over
// to the new Congress (docs/rollover-runbook.md):
//
//   API_BASE_URL=http://127.0.0.1:8000 node scripts/freeze-election-holders.mjs 2026 senate
//
// Needs Node 22.18 or later, which reads the TypeScript in src/lib directly.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildElectionMap, freezeHolders } from '../src/lib/elections.ts';

const [cycle, office] = process.argv.slice(2);
const base = (process.env.API_BASE_URL ?? '').replace(/\/$/, '');
if (!cycle || !office || !base) {
  console.error('usage: API_BASE_URL=... node scripts/freeze-election-holders.mjs <cycle> <office>');
  process.exit(1);
}
const path = join('content', 'elections', cycle, `${office}.json`);
const file = JSON.parse(readFileSync(path, 'utf8'));
const response = await fetch(`${base}/api/v1/congress/seats`);
if (!response.ok) throw new Error(`seats: ${response.status}`);
const { seats } = await response.json();
const frozen = freezeHolders(file, buildElectionMap(Number(cycle), office, file, seats));
writeFileSync(path, `${JSON.stringify(frozen, null, 2)}\n`);
const before = file.races.filter((r) => r.holder?.party).length;
console.log(`${path}: ${frozen.races.length - before} holders written, ${before} already there`);
