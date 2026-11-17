/** The States section (ADR 0035): types for GET /api/v1/states and /states/{abbr}, and the pure
 *  functions that turn them into what the pages draw. Runs at build time and in the browser. */
import { PARTY_FILL, type PartyLetter } from './seats';

// ---- API shapes -------------------------------------------------------------------------------

export type Control = 'R' | 'D' | 'I' | 'N' | 'split';
export type ControlKind = 'supermajority' | 'majority' | 'coalition' | 'nonpartisan' | 'none';
/** R, D, I (independent or another party) or N (Nebraska's nonpartisan legislature). */
export type StateParty = 'R' | 'D' | 'I' | 'N';

export interface StateGovernor {
  person_id: string;
  name: string;
  title: string;
  party: StateParty | null;
  party_label: string | null;
  image_url: string | null;
  website_url: string | null;
  start_date: string | null;
}

export interface StatePartySeats {
  party: StateParty;
  party_group: string;
  seats: number;
}

export interface StateChamber {
  chamber: 'upper' | 'lower' | 'legislature';
  name: string;
  title: string;
  seats: number;
  republican: number;
  democratic: number;
  other: number;
  nonpartisan: number;
  vacant: number;
  majority_seats: number;
  supermajority_seats: number;
  supermajority_fraction: string;
  supermajority_basis: string | null;
  control_party: StateParty | null;
  control_group: string | null;
  control_kind: ControlKind;
  control_note: string | null;
  parties: StatePartySeats[];
}

export interface StateSummary {
  state: string;
  name: string;
  control: Control;
  governor: StateGovernor | null;
  chambers: StateChamber[];
}

export interface StatesResponse {
  as_of: string;
  states: StateSummary[];
  generated_at: string;
  sources: { source: string; source_url: string; fetched_at: string }[];
}

export interface StateLegislator {
  person_id: string;
  chamber: StateChamber['chamber'];
  district: string;
  shape: string | null;
  district_seats: number | null;
  district_note: string | null;
  name: string;
  party: StateParty;
  party_label: string | null;
  image_url: string | null;
  email: string | null;
  website_url: string | null;
}

export interface StateDistrict {
  chamber: StateChamber['chamber'];
  district: string;
  seats: number;
  shape: string | null;
  note: string | null;
}

export interface StateDetailResponse {
  as_of: string;
  state: StateSummary;
  legislature_name: string;
  districts: StateDistrict[];
  legislators: StateLegislator[];
  generated_at: string;
  sources: StatesResponse['sources'];
}

/** /maps/states/{abbr}.json, written by ingest/state_maps.py. */
export interface StateDrawing {
  abbr: string;
  name: string;
  w: number;
  h: number;
  vintage: number;
  outline: string;
  chambers: Partial<Record<StateChamber['chamber'], [string, string][]>>;
}

/** /states/data/{abbr}.json: the districts and legislators the map needs, as short rows. */
export interface StateMapData {
  state: string;
  asOf: string;
  /** [chamber, district, shape | '', seats, note | ''] for every district, held or vacant */
  districts: [StateChamber['chamber'], string, string, number, string][];
  /** [chamber, district, shape | '', name, party, partyLabel, websiteUrl | ''] */
  rows: [StateChamber['chamber'], string, string, string, StateParty, string, string][];
}

// ---- colours and words ------------------------------------------------------------------------

export const NONPARTISAN_FILL = '#8E949C';
export const CONTROL_FILL: Record<Exclude<Control, 'split'>, string> = {
  R: PARTY_FILL.R,
  D: PARTY_FILL.D,
  I: PARTY_FILL.I,
  N: NONPARTISAN_FILL,
};

export function partyFill(party: StateParty | 'V'): string {
  return party === 'N' ? NONPARTISAN_FILL : PARTY_FILL[party as PartyLetter];
}

const PARTY_NAME: Record<StateParty, string> = {
  R: 'Republican',
  D: 'Democratic',
  I: 'Independent',
  N: 'Nonpartisan',
};

/** "Republican", "Democratic", or a smaller party's own name ("Partido Nuevo Progresista"). */
export function groupName(group: string | null, party: StateParty | null): string {
  if (group && !['R', 'D', 'N'].includes(group)) return group;
  return party ? PARTY_NAME[party] : 'No party';
}

/** The line that says who runs a state. */
export function controlLabel(summary: Pick<StateSummary, 'control' | 'governor' | 'chambers'>): string {
  switch (summary.control) {
    case 'R':
      return 'Republican control';
    case 'D':
      return 'Democratic control';
    case 'I': {
      const group = summary.chambers.find((c) => c.control_group)?.control_group ?? null;
      return `${groupName(group, 'I')} control`;
    }
    case 'N':
      return 'Nonpartisan legislature';
    default:
      return 'Divided government';
  }
}

/** The legend's words for each map colour. */
export const CONTROL_LEGEND: { key: Control; label: string }[] = [
  { key: 'R', label: 'Republican control' },
  { key: 'D', label: 'Democratic control' },
  { key: 'split', label: 'Divided government' },
  { key: 'N', label: 'Nonpartisan legislature' },
];

/** Who runs a chamber, in a few words: "Republican supermajority", "Bipartisan coalition". */
export function chamberHeadline(c: StateChamber): string {
  const who = groupName(c.control_group, c.control_party);
  switch (c.control_kind) {
    case 'supermajority':
      return `${who} supermajority`;
    case 'majority':
      return `${who} majority`;
    case 'coalition':
      return 'Run by a bipartisan coalition';
    case 'nonpartisan':
      return 'Nonpartisan';
    default:
      return 'No party has a majority';
  }
}

// ---- the chamber bar ---------------------------------------------------------------------------

export interface BarSegment {
  key: string;
  party: StateParty | 'V';
  seats: number;
  widthPct: number;
  /** The words in the legend: "Republican 58", "Vacant 1". */
  legend: string;
  /** The number inside the segment when it is wide enough; null otherwise. */
  barLabel: string | null;
}

export interface ChamberBarModel {
  chamber: StateChamber['chamber'];
  name: string;
  seatsLine: string;
  headline: string;
  headlineParty: StateParty | null;
  detail: string;
  majorityPct: number;
  supermajorityPct: number;
  majorityLabel: string;
  supermajorityLabel: string;
  segments: BarSegment[];
  ariaLabel: string;
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 10000) / 100 : 0);

export function buildChamberBar(c: StateChamber): ChamberBarModel {
  const segments: BarSegment[] = c.parties
    .filter((p) => p.seats > 0)
    .map((p) => ({
      key: `${p.party}-${p.party_group}`,
      party: p.party,
      seats: p.seats,
      widthPct: pct(p.seats, c.seats),
      legend: `${groupName(p.party_group, p.party)} ${p.seats}`,
      barLabel: pct(p.seats, c.seats) >= 6 ? String(p.seats) : null,
    }));
  if (c.vacant > 0) {
    // vacant seats sit before the Republicans, so each party's block starts at its own end
    const at = segments.findIndex((s) => s.party === 'R');
    const vacant: BarSegment = {
      key: 'vacant',
      party: 'V',
      seats: c.vacant,
      widthPct: pct(c.vacant, c.seats),
      legend: `Vacant ${c.vacant}`,
      barLabel: null,
    };
    segments.splice(at === -1 ? segments.length : at, 0, vacant);
  }
  const lead = c.control_kind === 'majority' || c.control_kind === 'supermajority';
  const detailParts = [`${c.majority_seats} seats for a majority`];
  if (c.control_kind !== 'nonpartisan') {
    detailParts.push(`${c.supermajority_seats} for a supermajority (${c.supermajority_fraction})`);
  }
  return {
    chamber: c.chamber,
    name: c.name,
    seatsLine: `${c.seats} seats`,
    headline: chamberHeadline(c),
    headlineParty: lead ? c.control_party : c.control_kind === 'nonpartisan' ? 'N' : null,
    detail: c.control_note ?? detailParts.join(' · '),
    majorityPct: pct(c.majority_seats, c.seats),
    supermajorityPct: pct(c.supermajority_seats, c.seats),
    majorityLabel: `Majority ${c.majority_seats}`,
    supermajorityLabel: `Supermajority ${c.supermajority_seats}`,
    segments,
    ariaLabel: `${c.name}: ${segments.map((s) => s.legend).join(', ')} of ${c.seats} seats. ${chamberHeadline(c)}.`,
  };
}

// ---- the legislature map ----------------------------------------------------------------------

export function toMapData(detail: StateDetailResponse): StateMapData {
  return {
    state: detail.state.state,
    asOf: detail.as_of,
    districts: detail.districts.map((d) => [d.chamber, d.district, d.shape ?? '', d.seats, d.note ?? '']),
    rows: detail.legislators.map((l) => [
      l.chamber,
      l.district,
      l.shape ?? '',
      l.name,
      l.party,
      l.party_label ?? '',
      l.website_url ?? '',
    ]),
  };
}

export interface DistrictMember {
  name: string;
  party: StateParty;
  partyLabel: string;
  websiteUrl: string | null;
  /** The district as Open States names it ("Hillsborough 12"), for shapes several share. */
  district: string;
}

export interface DistrictSeat {
  /** Census code of the shape. */
  shape: string;
  /** The districts drawn by this shape (Idaho's 10A and 10B share district 10's shape). */
  districts: string[];
  seats: number;
  members: DistrictMember[];
}

export interface ShapelessSeat {
  chamber: StateChamber['chamber'];
  district: string;
  seats: number;
  /** at-large, floterial or non-voting */
  note: string;
  members: DistrictMember[];
}

/** Members by chamber and shape, each shape with the seats it elects, so a wholly or partly
 *  vacant district still shows. Seats with no shape of their own (at-large, floterial,
 *  non-voting) come back in ``shapeless``, keyed the same way by district. */
export function indexDistricts(data: StateMapData): {
  byShape: Map<string, DistrictSeat>;
  shapeless: ShapelessSeat[];
} {
  const byShape = new Map<string, DistrictSeat>();
  const shapeless = new Map<string, ShapelessSeat>();
  for (const [chamber, district, shape, seats, note] of data.districts) {
    if (shape) {
      const id = `${chamber}|${shape}`;
      const seat = byShape.get(id) ?? { shape, districts: [], seats: 0, members: [] };
      seat.districts.push(district);
      seat.seats += seats;
      byShape.set(id, seat);
    } else {
      shapeless.set(`${chamber}|${district}`, { chamber, district, seats, note, members: [] });
    }
  }
  for (const [chamber, district, shape, name, party, partyLabel, websiteUrl] of data.rows) {
    const member: DistrictMember = { name, party, partyLabel, websiteUrl: websiteUrl || null, district };
    if (shape) {
      const id = `${chamber}|${shape}`;
      const seat = byShape.get(id) ?? { shape, districts: [district], seats: 1, members: [] };
      seat.members.push(member);
      byShape.set(id, seat);
    } else {
      const id = `${chamber}|${district}`;
      const group = shapeless.get(id) ?? { chamber, district, seats: 1, note: '', members: [] };
      group.members.push(member);
      shapeless.set(id, group);
    }
  }
  return { byShape, shapeless: [...shapeless.values()] };
}

/** The parties filling a shape, one letter per seat, vacancies as V: ['D', 'D', 'R', 'V']. */
export function seatLetters(seat: DistrictSeat): (StateParty | 'V')[] {
  const letters: (StateParty | 'V')[] = seat.members.map((m) => m.party);
  for (let i = seat.members.length; i < seat.seats; i += 1) letters.push('V');
  return letters;
}
