/** Model for the Congress overview page (/congress). Formatting and layout only: every count,
 *  share, threshold and margin is a mart column carried through /api/v1/congress/overview
 *  (docs/adr/0012, 0013). Nothing here adds, divides or compares figures. */
import { formatDate, formatNumber, formatShare, congressLabel } from './format';
import type {
  ChamberComposition,
  CongressOverviewResponse,
  PartyGroup,
  PassedBothItem,
} from './types';

export interface CompositionSegment {
  key: PartyGroup['party_group'];
  /** "218 R" inside the bar, or null when the segment is too narrow to hold text. */
  barLabel: string | null;
  widthPct: number;
  /** "Republican 218", "Independent 1 · caucus with R". */
  legend: string;
  title: string;
}

export interface ChamberBar {
  chamber: 'house' | 'senate';
  name: string;
  seatsLine: string;
  /** "Republicans control the House": who holds the majority, in words. */
  headline: string;
  /** Which party the headline is about, for the badge; null when nobody has a majority. */
  controlParty: 'republican' | 'democratic' | null;
  /** "219 seats caucus with Republicans (218 Republicans + 1 independent) · 214 with Democrats". */
  detail: string;
  majorityPct: number;
  majorityLabel: string;
  ariaLabel: string;
  segments: CompositionSegment[];
}

export interface StatCell {
  label: string;
  value: string;
  sub: string;
  note?: string;
}

export interface PassedRow {
  key: string;
  label: string;
  href: string;
  title: string;
  billPath: string;
  houseVote: string;
  senateVote: string;
  outcome: PassedBothItem['outcome'];
  outcomeLabel: string;
}

export interface CongressModel {
  title: string;
  dateRange: string;
  seatedLine: string;
  composition: {
    asOf: string;
    sources: { label: string; href: string }[];
    chambers: ChamberBar[];
  };
  activity: {
    heading: string;
    chip: string;
    meta: string;
    /** What the counts cover, in a sentence, with a link to the tracked members. */
    scope: string;
    trackedLabel: string;
    trackedHref: string;
    stats: StatCell[];
  };
  passedBoth: { chip: string; meta: string; scope: string; rows: PassedRow[] };
  footnote: string;
}

/** A bar segment holds its text only when it is wide enough to read; the legend carries every
 *  count regardless. This is layout, not a figure. */
const MIN_LABEL_PCT = 8;

const CAUCUS_LETTER = { republican: 'R', democratic: 'D' } as const;
const PARTY_LETTER: Record<string, string> = {
  republican: 'R',
  democratic: 'D',
  independent: 'I',
};

function segment(g: PartyGroup): CompositionSegment {
  const caucus = g.caucus_with ? ` · caucus with ${CAUCUS_LETTER[g.caucus_with]}` : '';
  const letter = PARTY_LETTER[g.party_group];
  return {
    key: g.party_group,
    barLabel: letter && g.seat_pct >= MIN_LABEL_PCT ? `${g.seats} ${letter}` : null,
    widthPct: g.seat_pct,
    legend: `${g.label} ${g.seats}${caucus}`,
    title: `${g.label}: ${g.seats} seats${g.caucus_with ? `, caucuses with ${g.caucus_with}` : ''}`,
  };
}

const PARTY_NOUN = { republican: 'Republicans', democratic: 'Democrats' } as const;
type Party = keyof typeof PARTY_NOUN;

/* One side's seat count in words. The party's own seats and any independents who caucus with
   it are both mart columns, so nothing is added here: "219 (218 Republicans + 1 independent)". */
function caucusSide(c: ChamberComposition, party: Party, total: number, short = false): string {
  const own = c.groups.find((g) => g.party_group === party);
  const indep = c.groups.find((g) => g.party_group === 'independent' && g.caucus_with === party);
  const detail =
    indep && own
      ? ` (${own.seats} ${PARTY_NOUN[party]} + ${indep.seats} independent${indep.seats === 1 ? '' : 's'})`
      : '';
  return `${total} ${short ? 'with' : 'seats caucus with'} ${PARTY_NOUN[party]}${detail}`;
}

function chamberBar(c: ChamberComposition): ChamberBar {
  const name = c.chamber === 'house' ? 'House' : 'Senate';
  const party: Party | null =
    c.majority_party === 'republican' || c.majority_party === 'democratic' ? c.majority_party : null;
  const rep = caucusSide(c, 'republican', c.republican_caucus);
  const dem = caucusSide(c, 'democratic', c.democratic_caucus);
  const repShort = caucusSide(c, 'republican', c.republican_caucus, true);
  const demShort = caucusSide(c, 'democratic', c.democratic_caucus, true);
  return {
    chamber: c.chamber,
    name,
    seatsLine: c.tiebreak_letter
      ? `${c.seats} seats · ${c.tiebreak_letter} Vice President breaks ties`
      : `${c.seats} seats`,
    headline: party
      ? `${PARTY_NOUN[party]} control the ${name}`
      : `Neither party has a majority in the ${name}`,
    controlParty: party,
    detail: party === 'republican' ? `${rep} · ${demShort}` : party === 'democratic' ? `${dem} · ${repShort}` : `${rep} · ${demShort}`,
    majorityPct: c.majority_pct,
    majorityLabel: `${c.majority_threshold} seats for a majority`,
    ariaLabel: `${name} composition: ${c.groups.map((g) => `${g.label} ${g.seats}`).join(', ')}. ${c.majority_threshold} seats are needed for a majority.`,
    segments: c.groups.map(segment),
  };
}

function vote(yea: number | null, nay: number | null): string {
  return yea === null || nay === null ? 'No roll call recorded' : `${yea}–${nay}`;
}

const OUTCOME_LABEL = {
  law: 'Law',
  vetoed: 'Vetoed',
  overridden: 'Overridden',
  adopted: 'Adopted',
  pending: 'Not enacted yet',
} as const;

function passedRow(item: PassedBothItem): PassedRow {
  const base = `${item.congress}/${item.bill_type}/${item.bill_number}`;
  const law = item.outcome === 'law' && item.public_law_number;
  return {
    key: base,
    label: item.label,
    href: item.congress_gov_url,
    title: item.title ?? item.label,
    billPath: `/bills/${base}`,
    houseVote: vote(item.house_yea, item.house_nay),
    senateVote: vote(item.senate_yea, item.senate_nay),
    outcome: item.outcome,
    outcomeLabel: law
      ? `Law ${item.public_law_number}`
      : item.outcome
        ? OUTCOME_LABEL[item.outcome]
        : 'Passed both',
  };
}

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

export function buildCongressModel(data: CongressOverviewResponse): CongressModel {
  const a = data.activity;
  const { composition } = data;
  const sources = composition.chambers.map((c) => ({
    label: c.chamber === 'house' ? 'Clerk of the House' : 'Senate.gov',
    href: c.source_url,
  }));
  const asOf = formatDate(composition.as_of);
  const pb = data.passed_both;

  return {
    title: `The ${congressLabel(data.congress)}`,
    dateRange: `${formatDate(data.congress_start)} — ${formatDate(data.congress_end)}`,
    seatedLine: `Seated ${formatNumber(composition.seated)} of ${formatNumber(composition.seats)} · ${plural(composition.vacant, 'vacancy', 'vacancies')}`,
    composition: { asOf, sources, chambers: composition.chambers.map(chamberBar) },
    activity: {
      heading: 'Legislative activity',
      chip: 'All sponsors',
      meta: `${congressLabel(data.congress)} to date`,
      scope: `Every bill in our database (${formatNumber(a.bills_in_dataset)}), whoever sponsored it: bills our ${a.tracked_members} tracked members sponsored or cosponsored, plus any bill a recorded roll call named. Not yet every bill in Congress.`,
      trackedLabel: 'See tracked members',
      trackedHref: '/members',
      stats: [
        {
          label: 'Bills in our database',
          value: formatNumber(a.bills_in_dataset),
          sub: `${formatNumber(a.bills_house)} House · ${formatNumber(a.bills_senate)} Senate`,
        },
        {
          label: 'Passed a chamber',
          value: formatNumber(a.passed_chamber),
          sub: `${formatNumber(a.passed_chamber_house_origin)} House bills · ${formatNumber(a.passed_chamber_senate_origin)} Senate bills`,
        },
        {
          label: 'Became law',
          value: formatNumber(a.became_law),
          sub: `${formatShare(a.became_law_pct)} of bills in our database`,
        },
        {
          label: 'Vetoed',
          value: formatNumber(a.vetoed),
          sub: `${formatNumber(a.vetoed_overridden)} overridden · ${formatNumber(a.vetoed_not_overridden)} not overridden`,
        },
      ],
    },
    passedBoth: {
      chip: 'All sponsors',
      scope: 'The same bills as the counts above.',
      meta: `${plural(pb.total, 'measure', 'measures')} · ${formatNumber(pb.enacted)} enacted · ${formatNumber(pb.adopted)} adopted · ${formatNumber(pb.vetoed)} vetoed`,
      rows: pb.items.map(passedRow),
    },
    footnote: `Composition figures hand-maintained, as of ${asOf} · bill and vote figures from the Congress.gov API and Senate.gov roll calls, refreshed nightly`,
  };
}
