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
  /** The chamber's roster page: /states/{abbr}/{slug} (senate, house, assembly, legislature, council). */
  slug: string;
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
  /** Parties are members' voter registration in an officially nonpartisan legislature. */
  by_registration: boolean;
  parties: StatePartySeats[];
}

export interface StateSummary {
  state: string;
  name: string;
  control: Control;
  /** Control is read from members' party registration (Nebraska). */
  by_registration: boolean;
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

/** Colours for parties other than the two national ones, by name (ADR 0035). Puerto Rico's are
 *  deliberately not their traditional colours: the PNP's blue and the PPD's red would read as
 *  Democratic and Republican everywhere else on the site. Anyone not listed (independents,
 *  minor parties) is the site's purple. */
export const GROUP_FILL: Record<string, string> = {
  'Partido Nuevo Progresista': '#0F7C78',
  'Partido Popular Democrático': '#D2731C',
  'Partido Independentista Puertorriqueño': '#3E8A3A',
  'Proyecto Dignidad': '#8A5A2B',
  'Movimiento Victoria Ciudadana': '#B03A7A',
};

/** The party group a member belongs to, by the same rule as the mart (state_seat_holder): R, D
 *  or N, "Independent", or a smaller party's own name. */
export function groupOf(party: StateParty, partyLabel: string | null): string {
  if (party === 'R' || party === 'D' || party === 'N') return party;
  const first = (partyLabel ?? '').split('/')[0].trim();
  if (!first || /^independent/i.test(first) || /^nonpartisan$/i.test(first)) return 'Independent';
  return first;
}

/** The colour of a party group; 'V' is an empty seat. */
export function groupFill(group: string): string {
  if (group === 'R' || group === 'D' || group === 'N' || group === 'V') return partyFill(group);
  return GROUP_FILL[group] ?? PARTY_FILL.I;
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
export function controlLabel(
  summary: Pick<StateSummary, 'control' | 'governor' | 'chambers'> & { by_registration?: boolean },
): string {
  const label = baseControlLabel(summary);
  return summary.by_registration ? `${label} (by party registration)` : label;
}

function baseControlLabel(summary: Pick<StateSummary, 'control' | 'governor' | 'chambers'>): string {
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
  /** The segment's colour: its party group's. */
  fill: string;
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
  /** The controlling group's colour, for a party other than R, D or N; null otherwise. */
  headlineFill: string | null;
  /** "Officially nonpartisan; shown by members' party registration", or null. */
  basisNote: string | null;
  detail: string;
  /** Where the lines fall along the bar, from its left edge. */
  majorityPct: number;
  supermajorityPct: number;
  /** True when the lines count in from the right edge (a Republican-led chamber). */
  fromRight: boolean;
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
      fill: groupFill(p.party_group),
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
      fill: groupFill('V'),
      seats: c.vacant,
      widthPct: pct(c.vacant, c.seats),
      legend: `Vacant ${c.vacant}`,
      barLabel: null,
    };
    segments.splice(at === -1 ? segments.length : at, 0, vacant);
  }
  // The threshold lines count seats in from the edge where the leading party's block starts:
  // the right edge for Republicans (drawn last), the left for anyone else, whose block is moved
  // to the front if it is not there already (a third party leading while Democrats hold seats).
  // The leader is the controlling group, or with no majority the group with the most seats.
  const leader =
    c.parties.find((p) => p.party_group === c.control_group) ??
    [...c.parties].sort((a, b) => b.seats - a.seats)[0];
  const fromRight = leader?.party === 'R';
  if (leader && !fromRight) {
    const i = segments.findIndex((s) => s.key === `${leader.party}-${leader.party_group}`);
    if (i > 0) segments.unshift(...segments.splice(i, 1));
  }
  const linePct = (seats: number) => (fromRight ? 100 - pct(seats, c.seats) : pct(seats, c.seats));
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
    headlineFill: lead && c.control_party === 'I' && c.control_group ? groupFill(c.control_group) : null,
    basisNote: c.by_registration
      ? "Officially nonpartisan. Members are shown by their party registration."
      : null,
    detail: c.control_note ?? detailParts.join(' · '),
    majorityPct: linePct(c.majority_seats),
    supermajorityPct: linePct(c.supermajority_seats),
    fromRight,
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

/** The party groups filling a shape, one per seat, vacancies as 'V': ['D', 'Partido Nuevo
 *  Progresista', 'V']. What the map colours by, so Puerto Rico's parties are told apart. */
export function seatGroups(seat: DistrictSeat): string[] {
  const groups = seat.members.map((m) => groupOf(m.party, m.partyLabel));
  for (let i = seat.members.length; i < seat.seats; i += 1) groups.push('V');
  return groups;
}

// ---- the roster pages (/states/{abbr}/{chamber slug}) -----------------------------------------

export interface StateOffice {
  address: string | null;
  phone: string | null;
}

export interface StateTerm {
  chamber: StateChamber['chamber'];
  chamber_name: string | null;
  district: string | null;
  /** null when Open States has no start date */
  start_date: string | null;
  /** null while the span runs */
  end_date: string | null;
}

export interface StateCommitteeSeat {
  name: string;
  /** upper, lower, or legislature (a joint committee) */
  chamber: StateChamber['chamber'];
  role: string | null;
}

export interface StateLegislatorProfile {
  person_id: string;
  district: string;
  district_note: string | null;
  name: string;
  family_name: string | null;
  party: StateParty;
  party_group: string;
  party_label: string | null;
  party_basis: 'party' | 'registration';
  image_url: string | null;
  email: string | null;
  website_url: string | null;
  capitol_office: StateOffice | null;
  district_office: StateOffice | null;
  social: { twitter: string | null; facebook: string | null; instagram: string | null; youtube: string | null };
  terms: StateTerm[];
  committees: StateCommitteeSeat[];
}

export interface StateRosterChamber {
  chamber: StateChamber['chamber'];
  slug: string;
  name: string;
  title: string;
  seats: number;
  vacant: number;
  legislators: StateLegislatorProfile[];
}

export interface StateRosterResponse {
  as_of: string;
  state: string;
  name: string;
  legislature_name: string;
  chambers: StateRosterChamber[];
  generated_at: string;
  sources: StatesResponse['sources'];
}

/** The id of a legislator's card on the roster page, from district and name, so the map can
 *  link to it without the person id: "berkshire-hampden-franklin-and-hampshire-paul-mark". */
export function legislatorAnchor(district: string, name: string): string {
  return `${district}-${name}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function rosterPath(abbr: string, slug: string, anchor?: string): string {
  return `/states/${abbr.toLowerCase()}/${slug}${anchor ? `#${anchor}` : ''}`;
}

/** Plural of a member's title for the page's count line: "40 senators", "80 assembly members". */
export function titlePlural(title: string, n: number): string {
  const word = title.toLowerCase();
  if (n === 1) return `1 ${word}`;
  return `${n} ${word.endsWith('member') ? `${word}s` : word.endsWith('s') ? word : `${word}s`}`;
}

/** "2023–present", "2011–2023", "Since 2019", or null when no year is known. */
export function termYears(t: Pick<StateTerm, 'start_date' | 'end_date'>): string | null {
  const start = t.start_date?.slice(0, 4) ?? null;
  const end = t.end_date?.slice(0, 4) ?? null;
  if (start && end) return start === end ? start : `${start}–${end}`;
  if (start) return `${start}–present`;
  if (end) return `Until ${end}`;
  return null;
}

/** A committee seat as the card lists it: "Finance (chair)", "Audit (joint)", "Rules (ranking
 *  Democratic member)". Roles are lower-cased except the party names in them. */
export function committeeLine(c: StateCommitteeSeat, bicameral: boolean): string {
  const tags: string[] = [];
  if (c.role) tags.push(c.role.toLowerCase().replace(/\b(democratic|republican)\b/g, (w) => w[0].toUpperCase() + w.slice(1)));
  if (bicameral && c.chamber === 'legislature') tags.push('joint');
  return tags.length ? `${c.name} (${tags.join(', ')})` : c.name;
}

export interface SocialLink {
  label: string;
  handle: string;
  href: string;
}

/** Links for the accounts Open States records. Values that are not a usable account name (a
 *  name with spaces, a mangled channel id) are left out. */
export function socialLinks(social: StateLegislatorProfile['social']): SocialLink[] {
  const plain = /^[A-Za-z0-9_.-]+$/;
  const out: SocialLink[] = [];
  const first = (v: string | null) => (v ?? '').split('|')[0].trim().replace(/^@/, '');
  const tw = first(social.twitter);
  if (plain.test(tw)) out.push({ label: 'X', handle: `@${tw}`, href: `https://x.com/${tw}` });
  const fb = first(social.facebook);
  if (plain.test(fb)) out.push({ label: 'Facebook', handle: fb, href: `https://www.facebook.com/${fb}` });
  const ig = first(social.instagram);
  if (plain.test(ig)) out.push({ label: 'Instagram', handle: `@${ig}`, href: `https://www.instagram.com/${ig}` });
  const yt = first(social.youtube);
  if (/^UC[A-Za-z0-9_-]{22}$/.test(yt)) {
    out.push({ label: 'YouTube', handle: 'Channel', href: `https://www.youtube.com/channel/${yt}` });
  } else if (plain.test(yt) && !/^uc[a-z0-9_-]{22}$/.test(yt)) {
    out.push({ label: 'YouTube', handle: yt, href: `https://www.youtube.com/${yt}` });
  }
  return out;
}

/** Initials for a missing photo: "PM" for Paul Mark. */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const last = words.length > 1 ? words[words.length - 1] : '';
  return (words[0][0] + (last[0] ?? '')).toUpperCase();
}

/** "District 7" for a numbered district, the name as written otherwise ("2nd Berkshire", "Ward 1"). */
export function districtName(district: string): string {
  return /^\d+[A-Z]?$/i.test(district) ? `District ${district}` : district;
}
