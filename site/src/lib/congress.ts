/** Model for the Congress overview page (/congress). Formatting and layout only: every count,
 *  share, threshold and margin is a mart column carried through /api/v1/congress/overview
 *  (docs/adr/0012, 0013). Nothing here adds, divides or compares figures. */
import { formatDate, formatNumber, formatShare, congressLabel } from './format';
import type {
  ChamberComposition,
  CongressOverviewResponse,
  OverviewMeasureType,
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
  marginLabel: string | null;
  marginTitle: string;
  ariaLabel: string;
  segments: CompositionSegment[];
}

export interface StatCell {
  label: string;
  value: string;
  sub: string;
  note?: string;
}

export interface TypeSegment {
  key: OverviewMeasureType['measure_type'];
  label: string;
  count: string;
  widthPct: number;
  /** Text inside the segment, or null when too narrow. */
  barLabel: string | null;
  legend: string;
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
  scope: { message: string; linkLabel: string; href: string };
  activity: { heading: string; meta: string; stats: StatCell[] };
  types: { segments: TypeSegment[] };
  passedBoth: { meta: string; rows: PassedRow[] };
  footnote: string;
}

/** A bar segment holds its text only when it is wide enough to read; the legend carries every
 *  count regardless. This is layout, not a figure. */
const MIN_LABEL_PCT = 8;
/** The measure-type labels are longer ("H.R. 212"), so they need a wider segment. */
const TYPE_MIN_LABEL_PCT = 12;

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

function chamberBar(c: ChamberComposition): ChamberBar {
  const name = c.chamber === 'house' ? 'House' : 'Senate';
  const majority = c.majority_letter
    ? `${c.majority_letter} +${c.majority_margin}`
    : null;
  return {
    chamber: c.chamber,
    name,
    seatsLine: `${c.seats} seats · ${c.majority_threshold} for majority`,
    marginLabel: majority,
    marginTitle: `Seats caucusing with Republicans ${c.republican_caucus}, with Democrats ${c.democratic_caucus}`,
    ariaLabel: `${name} composition: ${c.groups.map((g) => `${g.label} ${g.seats}`).join(', ')}`,
    segments: c.groups.map(segment),
  };
}

const TYPE_LEGEND: Record<OverviewMeasureType['measure_type'], string> = {
  house_bill: 'House bills',
  senate_bill: 'Senate bills',
  joint_resolution: 'Joint resolutions',
  other: 'Other',
};

function typeSegment(t: OverviewMeasureType): TypeSegment {
  const pct = t.bill_pct ?? 0;
  return {
    key: t.measure_type,
    label: t.label,
    count: formatNumber(t.bills),
    widthPct: pct,
    barLabel: pct >= TYPE_MIN_LABEL_PCT ? `${t.short_label} ${formatNumber(t.bills)}` : null,
    legend: `${TYPE_LEGEND[t.measure_type]} ${formatNumber(t.bills)}`,
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
    scope: {
      message: `Everything below counts only the ${a.tracked_members} members this site tracks — not all ${formatNumber(composition.seats)}.`,
      linkLabel: 'See tracked members',
      href: '/members',
    },
    activity: {
      heading: 'Legislative activity',
      meta: `${congressLabel(data.congress)} to date · ${a.tracked_house} House · ${a.tracked_senate} Senate`,
      stats: [
        {
          label: 'Bills introduced',
          value: formatNumber(a.bills_introduced),
          sub: `${formatNumber(a.introduced_house)} House · ${formatNumber(a.introduced_senate)} Senate`,
        },
        {
          label: 'Passed a chamber',
          value: formatNumber(a.passed_chamber),
          sub: `${formatNumber(a.passed_chamber_house_origin)} House-origin · ${formatNumber(a.passed_chamber_senate_origin)} Senate-origin`,
        },
        {
          label: 'Became law',
          value: formatNumber(a.became_law),
          sub: `${formatShare(a.became_law_pct)} of introduced`,
        },
        {
          label: 'Vetoed',
          value: formatNumber(a.vetoed),
          sub: `${formatNumber(a.vetoed_overridden)} overridden · ${formatNumber(a.vetoed_not_overridden)} not overridden`,
        },
        {
          label: 'Roll call votes',
          value: formatNumber(a.roll_call_votes),
          sub: `${formatNumber(a.roll_call_votes_house)} House · ${formatNumber(a.roll_call_votes_senate)} Senate`,
          note: 'Votes cast by tracked members',
        },
        {
          label: 'Committee actions',
          value: formatNumber(a.committee_actions),
          sub: 'On bills tracked members sponsored',
        },
        {
          label: 'Resolutions',
          value: formatNumber(a.resolutions),
          sub: 'Simple, concurrent, joint',
        },
        {
          label: 'Still in committee',
          value: formatNumber(a.still_in_committee),
          sub: `${formatShare(a.still_in_committee_pct)} of introduced`,
          note: 'No vote or floor action recorded',
        },
      ],
    },
    types: { segments: data.measure_types.map(typeSegment) },
    passedBoth: {
      meta: `${plural(pb.total, 'measure', 'measures')} · ${formatNumber(pb.enacted)} enacted · ${formatNumber(pb.adopted)} adopted · ${formatNumber(pb.vetoed)} vetoed`,
      rows: pb.items.map(passedRow),
    },
    footnote: `Composition figures hand-maintained, as of ${asOf} · activity figures from the Congress.gov API and Senate.gov roll calls, refreshed nightly`,
  };
}
