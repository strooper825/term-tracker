/** Reads the owner's election files from site/content/elections (ADR 0024). Server only.
 *
 *  One file per map: content/elections/{cycle}/{office}.json, edited at /admin. A map exists
 *  when its file does, so adding a cycle or an office is adding a file. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT_DIR } from './content';
import { OFFICES, buildElectionMap, type ElectionFile, type ElectionMapData, type Office } from './elections';
import type { SeatHolder } from './types';

export interface MapRef {
  cycle: number;
  office: Office;
}

/** Every map there is a file for, newest cycle first, offices in menu order. */
export function listElectionMaps(dir = CONTENT_DIR): MapRef[] {
  const root = join(dir, 'elections');
  if (!existsSync(root)) return [];
  const maps: MapRef[] = [];
  for (const name of readdirSync(root)) {
    if (!/^\d{4}$/.test(name)) continue;
    for (const office of OFFICES) {
      if (existsSync(join(root, name, `${office}.json`))) maps.push({ cycle: Number(name), office });
    }
  }
  return maps.sort((a, b) => b.cycle - a.cycle || OFFICES.indexOf(a.office) - OFFICES.indexOf(b.office));
}

export function loadElectionFile(cycle: number, office: Office, dir = CONTENT_DIR): ElectionFile {
  return JSON.parse(readFileSync(join(dir, 'elections', String(cycle), `${office}.json`), 'utf8')) as ElectionFile;
}

/** A map built from its file and, behind it, the same office's map one cycle back, so each
 *  cycle starts from the results of the one before. */
export function loadElectionMap(ref: MapRef, seats: SeatHolder[], dir = CONTENT_DIR): ElectionMapData {
  const before = listElectionMaps(dir).find((m) => m.office === ref.office && m.cycle < ref.cycle);
  const prior = before ? loadElectionMap(before, seats, dir) : null;
  return buildElectionMap(ref.cycle, ref.office, loadElectionFile(ref.cycle, ref.office, dir), seats, prior);
}

export const mapHref = ({ cycle, office }: MapRef) => `/elections/${cycle}/${office}`;
