/** Who holds each seat, shaped for the homepage map and the site search (ADR 0022).
 *
 *  Pure functions over GET /congress/seats rows, so they run at build time and in tests alike.
 *  Every member of Congress is on the map; only the tracked ones have a dashboard, and the rest
 *  link to their official website until coverage reaches all 535. */
import type { BillListItem, SeatHolder } from './types';

/** R, D, I, or V for a vacant seat. Any other party (none sit today) reads as independent. */
export type PartyLetter = 'R' | 'D' | 'I' | 'V';

export const PARTY_FILL: Record<PartyLetter, string> = {
  R: '#B9302F',
  D: '#1F4E9C',
  I: '#6B3FA0',
  V: '#ECEEF3',
};

export const PARTY_WORD: Record<PartyLetter, string> = {
  R: 'Republican',
  D: 'Democratic',
  I: 'Independent',
  V: 'Vacant',
};

export function partyLetter(party: string | null): PartyLetter {
  if (party === 'Republican') return 'R';
  if (party === 'Democrat' || party === 'Democratic') return 'D';
  return party ? 'I' : 'V';
}

/** One seat as the map and search need it: small, so the homepage can carry all of them. */
export interface MapSeat {
  key: string;
  chamber: 'house' | 'senate';
  state: string;
  stateName: string;
  district: number | null;
  /** "District 7", "At-large district", "Delegate", "Senior senator", ... */
  seatLabel: string;
  /** "WI-1", "AK at-large", "DC delegate", "WI senator" */
  shortLabel: string;
  name: string;
  bioguideId: string;
  party: PartyLetter;
  /** "Independent, caucuses with the Democrats" style note, or null. */
  partyNote: string | null;
  photoUrl: string;
  href: string;
  /** True when href leaves the site (an untracked member's official website). */
  external: boolean;
}

/** The non-voting seats: DC and the five territories. Their holders sit in the House. */
export const DELEGATE_STATES = new Set(['DC', 'AS', 'GU', 'MP', 'PR', 'VI']);

function seatLabels(seat: SeatHolder): { seatLabel: string; shortLabel: string } {
  if (seat.chamber === 'senate') {
    const rank = seat.state_rank === 'senior' ? 'Senior senator' : seat.state_rank === 'junior' ? 'Junior senator' : 'Senator';
    return { seatLabel: rank, shortLabel: `${seat.state} senator` };
  }
  if (DELEGATE_STATES.has(seat.state)) {
    const title = seat.state === 'PR' ? 'Resident Commissioner' : 'Delegate';
    return { seatLabel: title, shortLabel: `${seat.state} ${title.toLowerCase()}` };
  }
  if (!seat.district) return { seatLabel: 'At-large district', shortLabel: `${seat.state} at-large` };
  return { seatLabel: `District ${seat.district}`, shortLabel: `${seat.state}-${seat.district}` };
}

export function seatHref(seat: SeatHolder): { href: string; external: boolean } {
  if (seat.is_tracked) return { href: `/members/${seat.bioguide_id}`, external: false };
  return {
    href: seat.website_url ?? `https://bioguide.congress.gov/search/bio/${seat.bioguide_id}`,
    external: true,
  };
}

export function toMapSeat(seat: SeatHolder): MapSeat {
  const party = partyLetter(seat.party);
  const caucus = seat.caucus ? partyLetter(seat.caucus) : null;
  return {
    key: seat.seat_key,
    chamber: seat.chamber,
    state: seat.state,
    stateName: seat.state_name ?? seat.state,
    district: seat.chamber === 'house' ? (seat.district ?? 0) : null,
    ...seatLabels(seat),
    name: seat.name,
    bioguideId: seat.bioguide_id,
    party,
    partyNote:
      party === 'I' && (caucus === 'D' || caucus === 'R') ? `Caucuses with the ${caucus === 'D' ? 'Democrats' : 'Republicans'}` : null,
    photoUrl: seat.photo_url,
    ...seatHref(seat),
  };
}

/** Key of a House seat by state and district: "WI-1", "AK-0", "DC-0". */
export const houseKey = (state: string, district: number) => `${state}-${district}`;

export interface SeatIndex {
  house: Map<string, MapSeat>;
  /** Senators by state, senior first. */
  senate: Map<string, MapSeat[]>;
  /** Delegates of the territories (DC is drawn on the map). */
  territories: MapSeat[];
}

export function indexSeats(seats: MapSeat[]): SeatIndex {
  const house = new Map<string, MapSeat>();
  const senate = new Map<string, MapSeat[]>();
  const territories: MapSeat[] = [];
  for (const seat of seats) {
    if (seat.chamber === 'house') {
      house.set(houseKey(seat.state, seat.district ?? 0), seat);
      if (DELEGATE_STATES.has(seat.state) && seat.state !== 'DC') territories.push(seat);
    } else {
      senate.set(seat.state, [...(senate.get(seat.state) ?? []), seat]);
    }
  }
  for (const list of senate.values()) {
    list.sort((a, b) => (a.seatLabel === 'Senior senator' ? -1 : b.seatLabel === 'Senior senator' ? 1 : 0));
  }
  territories.sort((a, b) => a.stateName.localeCompare(b.stateName));
  return { house, senate, territories };
}

/** How a state is filled in the Senate view: one color when both seats agree, otherwise a
 *  striped pattern of the two (a vacancy counts as V). Null for DC, which has no senators. */
export function senateFill(senators: MapSeat[] | undefined, state: string): PartyLetter[] | null {
  if (state === 'DC') return null;
  const letters = (senators ?? []).map((s) => s.party);
  while (letters.length < 2) letters.push('V');
  const [a, b] = letters;
  return a === b ? [a] : [a, b].sort() as PartyLetter[];
}

/** The id of the SVG pattern striping two parties, e.g. "stripe-D-R". */
export const stripeId = (pair: PartyLetter[]) => `stripe-${pair.join('-')}`;

// ---- search ---------------------------------------------------------------------------------

export interface MemberHit {
  name: string;
  /** "Republican · WI-1" */
  detail: string;
  /** What an exact query matches: the name, lowercased. */
  key: string;
  /** Lowercased text the query is matched against: name, state name and code, seat. */
  haystack: string;
  href: string;
  external: boolean;
}

export interface BillHit {
  label: string;
  title: string;
  /** The label without dots or spaces, lowercased: "hr1", "sjres12". */
  key: string;
  haystack: string;
  href: string;
}

export function memberHits(seats: MapSeat[]): MemberHit[] {
  return seats
    .map((s) => ({
      name: s.name,
      detail: `${PARTY_WORD[s.party]} · ${s.chamber === 'senate' ? `${s.stateName} senator` : s.shortLabel}`,
      key: s.name.toLowerCase(),
      haystack: `${s.name} ${s.stateName} ${s.state} ${s.shortLabel} ${s.chamber === 'senate' ? 'senator' : 'representative'}`.toLowerCase(),
      href: s.href,
      external: s.external,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const compactLabel = (text: string) => text.toLowerCase().replace(/[.\s]/g, '');

/** What /search/bills.json carries per bill; the browser adds the search keys (billHits) so the
 *  file does not ship every title twice. */
export interface BillEntry {
  label: string;
  title: string;
  href: string;
}

export function billEntries(bills: BillListItem[]): BillEntry[] {
  return bills.map((b) => ({
    label: b.label,
    title: b.title,
    href: `/bills/${b.congress}/${b.bill_type}/${b.bill_number}`,
  }));
}

export function billHits(entries: BillEntry[]): BillHit[] {
  return entries.map((b) => ({
    ...b,
    key: compactLabel(b.label),
    haystack: `${b.label} ${compactLabel(b.label)} ${b.title}`.toLowerCase(),
  }));
}

/** Hits matching the query, best first: an exact name or bill number, then one that starts
 *  with the query, then any hit holding every word of it. */
export function search<T extends { key: string; haystack: string }>(
  hits: T[],
  query: string,
  limit = 8,
): T[] {
  const words = query.toLowerCase().replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const compact = compactLabel(query);
  const long = words.filter((w) => w.length > 1);
  const scored: { hit: T; score: number }[] = [];
  for (const hit of hits) {
    const prefix = compact.length > 1 && hit.key.startsWith(compact);
    // one-letter words (the H and R of "H.R. 1") match almost anything, so only longer words
    // are matched against the text; a query made only of them relies on the prefix
    if (!prefix && (long.length === 0 || !long.every((w) => hit.haystack.includes(w)))) continue;
    const score = hit.key === compact ? 0 : prefix || hit.haystack.startsWith(words[0]) ? 1 : 2;
    scored.push({ hit, score });
  }
  return scored
    // stable: within a score, hits keep their order (members by name, bills as listed)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.hit);
}
