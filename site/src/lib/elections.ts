/** The what-if election maps (ADR 0024): the shape of a map, how a visitor's picks are counted,
 *  and how a map is put together from the owner's file and the seat data.
 *
 *  Pure functions, so they run at build time, in the browser and in tests alike. Nothing here
 *  reads a file; lib/electionsContent.ts does that. */
import type { SeatHolder } from './types';

export const OFFICES = ['president', 'senate', 'governor'] as const;
export type Office = (typeof OFFICES)[number];

export const OFFICE_LABEL: Record<Office, string> = {
  president: 'President',
  senate: 'Senate',
  governor: 'Governor',
};

/** D, R, I (any other party or an independent), or U: undecided, not called, or vacant. */
export type Side = 'D' | 'R' | 'I' | 'U';

export const SIDE_FILL: Record<Side, string> = { D: '#1F4E9C', R: '#B9302F', I: '#6B3FA0', U: '#CCD1D5' };
export const SIDE_WORD: Record<Side, string> = { D: 'Democratic', R: 'Republican', I: 'Other', U: 'Undecided' };

export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas',
  UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming',
};
const DC = 'District of Columbia';

/** Electoral votes for 2024 and 2028 (the 2020 apportionment). Maine and Nebraska give two to
 *  the statewide winner and one to the winner of each congressional district. */
export const ELECTORAL_VOTES: Record<string, number> = {
  AL: 9, AK: 3, AZ: 11, AR: 6, CA: 54, CO: 10, CT: 7, DE: 3, DC: 3, FL: 30, GA: 16, HI: 4, ID: 4,
  IL: 19, IN: 11, IA: 6, KS: 6, KY: 8, LA: 8, ME: 2, 'ME-1': 1, 'ME-2': 1, MD: 10, MA: 11, MI: 15,
  MN: 10, MS: 6, MO: 10, MT: 4, NE: 2, 'NE-1': 1, 'NE-2': 1, 'NE-3': 1, NV: 6, NH: 4, NJ: 14, NM: 5,
  NY: 28, NC: 16, ND: 3, OH: 17, OK: 7, OR: 8, PA: 19, RI: 4, SC: 9, SD: 3, TN: 11, TX: 40, UT: 6,
  VT: 3, VA: 13, WA: 12, WV: 4, WI: 10, WY: 3,
};

/** The units the Democratic ticket carried in 2024; the Republican ticket carried the rest. */
const DEMOCRATIC_2024 = new Set('CA CO CT DE DC HI IL ME ME-1 MD MA MN NE-2 NH NJ NM NY OR RI VT VA WA'.split(' '));

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

// ---- the owner's file (site/content/elections/{cycle}/{office}.json) ----

export interface HolderFile {
  /** Democratic, Republican, Independent, any other party name, or Vacant. */
  party?: string;
  /** The party an independent or third-party holder counts with, when there is one. */
  caucus?: string;
  name?: string;
  /** Bioguide id, so the holder links to their profile when they have one. */
  member?: string;
}

export interface CandidateFile extends HolderFile {
  id?: string;
  /** Reserved for money raised and spent (ADR 0024); not shown yet. */
  fecId?: string;
  /** The owner's call. At most one per race. */
  winner?: boolean;
}

export interface RaceFile {
  /** Permanent: "2026-senate-ar". */
  id?: string;
  state?: string;
  /** Senate only: 1, 2 or 3. It says which of the state's two seats this is. */
  seatClass?: number;
  /** President only: a congressional district of Maine or Nebraska. */
  district?: number;
  special?: boolean;
  /** Who holds the seat going in. Absent, it comes from the cycle before or the seat data. */
  holder?: HolderFile;
  candidates?: CandidateFile[];
  /** The call for a race that has no candidates of its own. */
  winnerParty?: string;
  winnerCaucus?: string;
  calledOn?: string;
  note?: string;
}

export interface ElectionFile {
  archived?: boolean;
  /** President only: the tickets, the same in every state. */
  candidates?: CandidateFile[];
  races?: RaceFile[];
  /** Governor only: states with no race this cycle, where the cycle before does not say. */
  others?: ({ state?: string } & HolderFile)[];
}

// ---- the map as the page uses it ----

export interface Holder {
  party: Side;
  /** The side this seat counts toward for control: an independent's caucus, else the party. */
  countAs: Side;
  name: string | null;
  /** Bioguide id, when the holder is a member of Congress. */
  member: string | null;
  /** The member's profile, when they have one on the site. */
  href: string | null;
}

/** One thing a visitor can pick for a race: a candidate, a party, or undecided. */
export interface Choice {
  key: string;
  party: Side;
  countAs: Side;
  label: string;
  /** The line under the label: the party, "incumbent". Empty for a bare party. */
  sub: string;
  href: string | null;
}

export interface Race {
  id: string;
  /** Which seat this is, the same from cycle to cycle: "AR-2" (Senate), "AR", "ME-2". */
  seat: string;
  state: string;
  stateName: string;
  /** "Arkansas", "Maine 2nd District". */
  label: string;
  /** President only, for a Maine or Nebraska district; null everywhere else. */
  district: number | null;
  /** What the race is worth in the count: electoral votes, else 1. */
  weight: number;
  special: boolean;
  holder: Holder;
  /** Every choice in the order a click cycles through them, ending with undecided. */
  choices: Choice[];
  /** The key of the choice the map starts on: the holder. */
  start: string;
  /** The owner's call, as a choice key, or null while the race is not called. */
  result: string | null;
  calledOn: string | null;
  note: string | null;
}

export interface OtherSeat extends Holder {
  seat: string;
  state: string;
}

export interface ElectionMapData {
  cycle: number;
  office: Office;
  archived: boolean;
  /** The whole body: 538 electoral votes, 100 senators, 50 governors. */
  total: number;
  /** What wins control, or null where there is no majority to win (governors). */
  majority: number | null;
  races: Race[];
  /** The seats that are not on the ballot. */
  others: OtherSeat[];
}

export const HOLD = 'hold';
const UNDECIDED: Choice = { key: 'U', party: 'U', countAs: 'U', label: 'Undecided', sub: '', href: null };

export function sideOf(party: string | undefined | null): Side {
  const p = (party ?? '').trim().toLowerCase();
  if (p === 'democratic' || p === 'democrat') return 'D';
  if (p === 'republican') return 'R';
  if (!p || p === 'vacant') return 'U';
  return 'I';
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** What a key means for a race. HOLD is the holder as they are, so an independent who caucuses
 *  with a party still counts with it on the untouched map. */
export function resolve(race: Race, key: string | null | undefined): Choice {
  if (key === HOLD) {
    const { party, countAs, name, href } = race.holder;
    return { key: HOLD, party, countAs, label: name ?? SIDE_WORD[party], sub: '', href };
  }
  return race.choices.find((c) => c.key === key) ?? UNDECIDED;
}

/** Put a map together from the owner's file.
 *
 *  `seats` is GET /congress/seats: the Senate's holders, the senators not on the ballot, and
 *  which members have a profile to link to. `prior` is the same office's map one cycle back:
 *  a seat it called passes to its winner, so 2028 starts from the 2026 results. A file that
 *  contradicts itself fails the build rather than the page. */
export function buildElectionMap(
  cycle: number,
  office: Office,
  file: ElectionFile,
  seats: SeatHolder[],
  prior: ElectionMapData | null = null,
): ElectionMapData {
  const where = `elections/${cycle}/${office}`;
  const tracked = new Set(seats.filter((s) => s.is_tracked).map((s) => s.bioguide_id));
  const profile = (member: string | null | undefined) => (member && tracked.has(member) ? `/members/${member}` : null);
  const senators = seats.filter((s) => s.chamber === 'senate' && STATE_NAMES[s.state]);

  const holderOf = (f: HolderFile): Holder => {
    const party = sideOf(f.party);
    const caucus = sideOf(f.caucus);
    const member = f.member?.trim() || null;
    return {
      party,
      countAs: party === 'I' && (caucus === 'D' || caucus === 'R') ? caucus : party,
      name: f.name?.trim() || null,
      member,
      href: profile(member),
    };
  };
  const sitting = (s: SeatHolder): Holder =>
    holderOf({ party: s.party ?? 'Vacant', caucus: s.caucus ?? undefined, name: s.name, member: s.bioguide_id });

  /** Who the cycle before left in a seat: the winner where it was called, else its holder. */
  const carried = (seat: string): Holder | null => {
    const race = prior?.races.find((r) => r.seat === seat);
    if (race?.result) {
      const won = resolve(race, race.result);
      const named = won.key.startsWith('c-');
      return { party: won.party, countAs: won.countAs, name: named ? won.label : null, member: null, href: named ? won.href : null };
    }
    const kept = race?.holder ?? prior?.others.find((o) => o.seat === seat);
    return kept ? { party: kept.party, countAs: kept.countAs, name: kept.name, member: kept.member, href: profile(kept.member) } : null;
  };

  const candidateChoices = (entered: CandidateFile[], holder: Holder | null) => {
    const used = new Set<string>();
    let incumbent: string | null = null;
    let winner: string | null = null;
    const choices = entered
      .filter((c) => c.name?.trim())
      .map((c): Choice => {
        const base = c.id?.trim() || slug(c.name ?? '');
        let key = `c-${base}`;
        for (let n = 2; used.has(key); n += 1) key = `c-${base}-${n}`;
        used.add(key);
        const side = holderOf(c);
        const isHolder = Boolean(side.member && side.member === holder?.member);
        if (isHolder) incumbent = key;
        if (c.winner) winner = key;
        const partyName = side.party === 'I' || side.party === 'U' ? (c.party ?? 'Independent').trim() || 'Independent' : SIDE_WORD[side.party];
        return {
          key,
          party: side.party === 'U' ? 'I' : side.party,
          countAs: side.countAs === 'U' ? 'I' : side.countAs,
          label: (c.name ?? '').trim(),
          sub: isHolder ? `${partyName} · incumbent` : partyName,
          href: side.href,
        };
      });
    return { choices, incumbent: incumbent as string | null, winner: winner as string | null };
  };
  const ticket = office === 'president' ? candidateChoices(file.candidates ?? [], null).choices : [];

  const raced = new Set<string>();
  const ids = new Set<string>();
  const races = (file.races ?? []).map((raw): Race => {
    const state = (raw.state ?? '').toUpperCase();
    const stateName = STATE_NAMES[state] ?? (office === 'president' && state === 'DC' ? DC : undefined);
    if (!stateName) throw new Error(`${where}: "${raw.state}" is not a state`);
    const district = office === 'president' && raw.district ? raw.district : null;
    let seat = state;
    if (office === 'senate') {
      if (![1, 2, 3].includes(raw.seatClass ?? 0)) throw new Error(`${where}: ${state} needs seatClass 1, 2 or 3`);
      seat = `${state}-${raw.seatClass}`;
    } else if (district) seat = `${state}-${district}`;
    if (raced.has(seat)) throw new Error(`${where}: two races for ${seat}`);
    raced.add(seat);
    const id = raw.id?.trim() || `${cycle}-${office}-${seat.toLowerCase()}`;
    if (ids.has(id)) throw new Error(`${where}: two races have the id ${id}`);
    ids.add(id);

    let holder: Holder | null = raw.holder?.party ? holderOf(raw.holder) : null;
    let weight = 1;
    if (office === 'president') {
      weight = ELECTORAL_VOTES[seat];
      if (!weight) throw new Error(`${where}: ${seat} has no electoral votes`);
      holder ??= holderOf({ party: DEMOCRATIC_2024.has(seat) ? 'Democratic' : 'Republican' });
    } else if (office === 'senate') {
      const senator = senators.find((s) => `${s.state}-${s.senate_class}` === seat);
      holder ??= (prior?.races.find((r) => r.seat === seat)?.result ? carried(seat) : null) ?? (senator ? sitting(senator) : holderOf({ party: 'Vacant' }));
    } else {
      holder ??= carried(seat);
    }
    if (!holder) throw new Error(`${where}: ${id} needs a holder`);

    const entered = raw.candidates ?? [];
    if (entered.filter((c) => c.winner).length > 1) throw new Error(`${where}: ${id} has more than one winner`);
    const own = candidateChoices(entered, holder);
    const choices = own.choices.length ? own.choices : ticket.map((c) => ({ ...c }));
    let winner = own.winner;
    if (!choices.length) {
      for (const side of ['D', 'R', 'I'] as const) {
        choices.push({ key: side, party: side, countAs: side, label: SIDE_WORD[side], sub: '', href: null });
      }
    }
    if (!winner && raw.winnerParty) {
      const called = holderOf({ party: raw.winnerParty, caucus: raw.winnerCaucus });
      const match = choices.find((c) => c.party === called.party && c.countAs === called.countAs);
      if (match) winner = match.key;
      else if (called.party !== 'U') {
        // an independent who will caucus with a party: its own choice, so the count is right
        winner = `I-${called.countAs}`;
        choices.push({ key: winner, party: called.party, countAs: called.countAs, label: 'Independent', sub: '', href: null });
      }
    }
    choices.push(UNDECIDED);

    return {
      id,
      seat,
      state,
      stateName,
      label: district ? `${stateName} ${ordinal(district)} District` : stateName,
      district,
      weight,
      special: Boolean(raw.special),
      holder,
      choices,
      start: own.incumbent ?? HOLD,
      result: winner,
      calledOn: raw.calledOn?.trim() || null,
      note: raw.note?.trim() || null,
    };
  });

  let others: OtherSeat[] = [];
  if (office === 'senate') {
    others = senators
      .filter((s) => !raced.has(`${s.state}-${s.senate_class}`))
      .map((s) => {
        const seat = `${s.state}-${s.senate_class}`;
        const called = prior?.races.find((r) => r.seat === seat)?.result ? carried(seat) : null;
        return { seat, state: s.state, ...(called ?? sitting(s)) };
      });
  } else if (office === 'governor') {
    const listed = new Map((file.others ?? []).map((o) => [(o.state ?? '').toUpperCase(), o]));
    for (const state of listed.keys()) if (!STATE_NAMES[state]) throw new Error(`${where}: "${state}" is not a state`);
    for (const state of Object.keys(STATE_NAMES)) {
      if (raced.has(state)) continue;
      const own = listed.get(state);
      const holder = own?.party ? holderOf(own) : carried(state);
      if (holder) others.push({ seat: state, state, ...holder });
    }
  }

  return {
    cycle,
    office,
    archived: Boolean(file.archived),
    total: office === 'president' ? 538 : office === 'senate' ? 100 : 50,
    majority: office === 'president' ? 270 : office === 'senate' ? 51 : null,
    races,
    others,
  };
}

/** The file with every race's holder written into it, for a race that has none of its own.
 *  Run once when a Congress ends (rollover-runbook.md): after that the seat data describes the
 *  new Congress, and the old map must keep the holders it had. */
export function freezeHolders(file: ElectionFile, map: ElectionMapData): ElectionFile {
  const word = (side: Side) => (side === 'U' ? 'Vacant' : side === 'I' ? 'Independent' : SIDE_WORD[side]);
  return {
    ...file,
    races: (file.races ?? []).map((raw, i) => {
      if (raw.holder?.party) return raw;
      const { party, countAs, name, member } = map.races[i].holder;
      return {
        ...raw,
        holder: {
          party: word(party),
          ...(countAs !== party ? { caucus: word(countAs) } : {}),
          ...(name ? { name } : {}),
          ...(member ? { member } : {}),
        },
      };
    }),
  };
}

// ---- counting ----

/** A visitor's map: the chosen key per race id. A race that is absent is on its starting choice. */
export type Picks = Record<string, string>;

export type View = 'play' | 'full' | 'final';

/** The race's choice in a view: the visitor's pick, or the owner's call on the final view. */
export function chosen(race: Race, picks: Picks, view: View): Choice {
  return resolve(race, view === 'final' ? race.result : (picks[race.id] ?? race.start));
}

/** The key a click moves a race to: the next choice in the list, wrapping round. */
export function nextKey(race: Race, current: string): string {
  let at = race.choices.findIndex((c) => c.key === current);
  if (at < 0) at = race.choices.findIndex((c) => c.party === resolve(race, current).party);
  return race.choices[(at + 1) % race.choices.length].key;
}

/** A stored map with anything the file no longer offers dropped, so an old save cannot break
 *  a map whose candidates have changed since. */
export function validPicks(map: ElectionMapData, stored: unknown): Picks {
  const out: Picks = {};
  if (!stored || typeof stored !== 'object') return out;
  for (const race of map.races) {
    const key = (stored as Record<string, unknown>)[race.id];
    if (typeof key === 'string' && (key === HOLD || race.choices.some((c) => c.key === key))) out[race.id] = key;
  }
  return out;
}

export type Counts = Record<Side, number>;

/** The count by the side each seat counts toward: seats not on the ballot plus each race's choice. */
export function tally(map: ElectionMapData, picks: Picks, view: View): Counts {
  const counts: Counts = { D: 0, R: 0, I: 0, U: 0 };
  for (const seat of map.others) counts[seat.countAs] += 1;
  for (const race of map.races) counts[chosen(race, picks, view).countAs] += race.weight;
  return counts;
}

/** The body as it stands going in: every seat by its holder. For President, the 2024 result. */
export function standing(map: ElectionMapData): Counts {
  const counts: Counts = { D: 0, R: 0, I: 0, U: 0 };
  for (const seat of map.others) counts[seat.countAs] += 1;
  for (const race of map.races) counts[race.holder.countAs] += race.weight;
  return counts;
}

/** Who a count leaves in control, in a few words. */
export function control(map: ElectionMapData, counts: Counts): string {
  if (map.office === 'president') {
    if (counts.D >= 270) return 'Democratic win';
    if (counts.R >= 270) return 'Republican win';
    return counts.D === 269 && counts.R === 269 ? 'Tied 269 to 269' : 'No winner yet';
  }
  if (map.majority) {
    if (counts.D >= map.majority) return 'Democratic majority';
    if (counts.R >= map.majority) return 'Republican majority';
    if (counts.D === counts.R && counts.D * 2 === map.total) return `Tied ${counts.D} to ${counts.R}`;
    return 'No majority yet';
  }
  if (counts.D > counts.R) return 'More Democratic Governors';
  if (counts.R > counts.D) return 'More Republican Governors';
  return 'Even split';
}

/** How many races a visitor has moved off the starting map. */
export function changed(map: ElectionMapData, picks: Picks): number {
  return map.races.filter((r) => picks[r.id] !== undefined && picks[r.id] !== r.start).length;
}

/** The parties of a state's seats in a view: the race's choice first, then the seats not on the
 *  ballot. The play view shows only what is on the ballot, and a district is not the state.
 *  Empty for a state with no seat. */
export function stateSeats(map: ElectionMapData, picks: Picks, view: View): Map<string, Side[]> {
  const out = new Map<string, Side[]>();
  const add = (state: string, side: Side) => out.set(state, [...(out.get(state) ?? []), side]);
  for (const race of map.races) if (race.district === null) add(race.state, chosen(race, picks, view).party);
  if (view === 'full') for (const seat of map.others) add(seat.state, seat.party);
  return out;
}

/** The two colours of a striped state, or one colour repeated when its seats agree. */
export function stripeOf(seats: Side[]): [Side, Side] {
  const distinct = [...new Set(seats)].sort();
  return [distinct[0], distinct[1] ?? distinct[0]];
}
