/** Pure functions from API rows (mart columns) to the props the design components take.
 *  Nothing here computes a statistic; it formats, labels, groups, and fills empty weeks.
 *  Every displayed number traces back to a named mart column (see docs/data-dictionary.md). */

import { EVENT_TYPE_FROM_MART, type EventKey, type PartyName } from '@/data/eventTypes';
import {
  billPath,
  congressLabel,
  cycleLabel,
  daysBetween,
  formatDate,
  formatLongDate,
  formatMoney,
  formatNumber,
  formatPercent,
  formatShare,
  formatTimestampUtc,
  ordinal,
  parseDate,
  titleCase,
  toIsoDate,
} from './format';
import type {
  BillAction,
  BillCosponsor,
  BillDetail,
  BillRollCall,
  BillSummaryVersion,
  CommitteeAssignment,
  FeedItem,
  FreshnessResponse,
  FundraisingResponse,
  JourneyStage,
  JourneyStatus,
  KeyDate,
  PassageVote,
  MemberDetail,
  MemberListItem,
} from './types';

export type Chamber = 'House' | 'Senate';

export interface Stat {
  label: string;
  value: string;
  note: string;
}

export interface MemberHeaderModel {
  bioguideId: string;
  name: string;
  lastName: string;
  party: PartyName;
  chamber: Chamber;
  chamberLabel: string;
  state: string;
  seat: string;
  seatShort: string;
  congress: string;
  /** The four or five facts under the name, each a label over a value (term dates, roll calls,
   *  age, serving since, term number). */
  facts: HeaderFact[];
  /** Current party or chamber leadership title from congress-legislators, if any. */
  leadershipTitle: string | null;
  /** "Caucuses with Democrats" for an Independent; null otherwise. */
  caucusNote: string | null;
  photoUrl: string | null;
}

export interface HeaderFact {
  label: string;
  value: string;
  /** A qualifier set apart from the value: "in the 119th", "3rd in the Senate". */
  note?: string;
}

export interface TermModel {
  start: string;
  end: string;
  elapsed: number;
  total: number;
}

export interface CommitteeRow {
  name: string;
  role: string;
}

export interface ElectionModel {
  date: string;
  daysAway: number;
  kind: string;
  onBallot: boolean;
  opponent: string | null;
  rating: string | null;
}

export interface KeyDateRow {
  date: string;
  label: string;
}

export interface FeedRow {
  type: EventKey;
  lead?: string;
  headline: string;
  secondary: string;
  /** Uncapped text when `secondary` is a summary (en bloc votes); shown on hover. */
  secondaryFull?: string;
  /** Where the row goes when there is no bill page: congress.gov or senate.gov. */
  source: string;
  /** The bill page here, set when the event names a bill that has one. A row shows either
   *  this or `source`, never both, so each row has a single destination. */
  detailsHref?: string;
  /** mart.member_feed.policy_area. Null on nomination votes, procedural roll calls,
   *  amendments, and bills Congress.gov has not classified. */
  policyArea: string | null;
  /** mart.member_feed.event_date, ISO, for the date filter to compare against. */
  isoDate: string;
}

export interface IndexRow {
  bioguideId: string;
  name: string;
  lastName: string;
  party: PartyName;
  chamber: Chamber;
  state: string;
  seatShort: string;
  attendance: number | null;
  sponsored: number;
  unity: number | null;
  photoUrl: string | null;
}

/** mart.term.party uses congress-legislators spelling ("Democrat"); the design uses "Democratic". */
export function partyName(party: string | null): PartyName {
  if (party === 'Democrat' || party === 'Democratic') return 'Democratic';
  if (party === 'Republican') return 'Republican';
  return 'Independent';
}

export function chamberName(chamber: 'house' | 'senate'): Chamber {
  return chamber === 'house' ? 'House' : 'Senate';
}

export function chamberLabel(chamber: 'house' | 'senate'): string {
  return chamber === 'house' ? 'U.S. House of Representatives' : 'U.S. Senate';
}

export function memberDisplayName(chamber: 'house' | 'senate', officialFull: string): string {
  return `${chamber === 'house' ? 'Rep.' : 'Sen.'} ${officialFull}`;
}

/** Long seat form: "Wisconsin’s 1st District", "Alaska At Large", "Arkansas · Class 2". */
export function seatLong(seat: MemberDetail['seat']): string {
  const state = seat.state_name ?? seat.state;
  if (seat.chamber === 'senate') {
    return seat.senate_class ? `${state} · Class ${seat.senate_class}` : state;
  }
  if (seat.district === 0 || seat.district === null) return `${state} At Large`;
  return `${state}’s ${ordinal(seat.district)} District`;
}

export function committeeRole(title: string | null): string {
  if (!title) return 'Member';
  const t = title.toLowerCase();
  if (t.startsWith('vice chair')) return 'Vice Chair';
  if (t.startsWith('chair')) return 'Chair';
  if (t.startsWith('ranking')) return 'Ranking';
  return title;
}

export function committeeDisplayName(c: CommitteeAssignment): string {
  if (c.parent_thomas_id && !/subcommittee/i.test(c.name)) return `Subcommittee on ${c.name}`;
  return c.name;
}

/** Subcommittee chairs are labelled apart from full-committee chairs so the card agrees with
 *  the chairmanships stat (which counts full committees only). */
export function committeeRowRole(c: CommitteeAssignment): string {
  const role = committeeRole(c.title);
  return role === 'Chair' && c.parent_thomas_id ? 'Subcommittee chair' : role;
}

export function buildCommitteeRows(committees: CommitteeAssignment[]): CommitteeRow[] {
  const order = (c: CommitteeAssignment) => (committeeRole(c.title) === 'Chair' ? 0 : 1);
  return [...committees]
    .sort((a, b) => order(a) - order(b) || (a.parent_thomas_id ? 1 : 0) - (b.parent_thomas_id ? 1 : 0))
    .map((c) => ({ name: committeeDisplayName(c), role: committeeRowRole(c) }));
}

const PARTY_MEMBERS: Record<PartyName, string> = {
  Republican: 'Republicans',
  Democratic: 'Democrats',
  Independent: 'Independents',
};

/** The caucus as a party name when it differs from the member's own party, else null. */
export function caucusParty(detail: Pick<MemberDetail, 'party' | 'caucus'>): PartyName | null {
  if (!detail.caucus) return null;
  const caucus = partyName(detail.caucus);
  return caucus === partyName(detail.party) ? null : caucus;
}

/** Age, serving since, and term number as labelled facts; members who changed chamber get
 *  "3rd in the Senate" as a note on the term, so a first-term senator with House service reads
 *  correctly. */
export function serviceFacts(detail: MemberDetail): HeaderFact[] {
  const svc = detail.service;
  const chamber = chamberName(detail.seat.chamber);
  const since = parseDate(svc.serving_since).getUTCFullYear();
  const changedChamber = svc.terms.some((t) => t.chamber !== detail.seat.chamber);
  return [
    ...(detail.bio.age === null ? [] : [{ label: 'Age', value: String(detail.bio.age) }]),
    { label: 'Serving since', value: String(since) },
    {
      label: 'Term',
      value: ordinal(svc.term_number),
      ...(changedChamber ? { note: `${ordinal(svc.chamber_term_number)} in the ${chamber}` } : {}),
    },
  ];
}

export function buildHeader(detail: MemberDetail): MemberHeaderModel {
  const chamber = chamberName(detail.seat.chamber);
  const tracked = ordinal(detail.term.tracked_congress);
  const multi = detail.term.congresses.length > 1;
  const rollCalls = detail.votes.roll_calls ?? 0;
  const caucus = caucusParty(detail);
  return {
    bioguideId: detail.bioguide_id,
    name: memberDisplayName(detail.seat.chamber, detail.name.official_full),
    lastName: detail.name.last,
    party: partyName(detail.party),
    chamber,
    chamberLabel: chamberLabel(detail.seat.chamber),
    state: detail.seat.state_name ?? detail.seat.state,
    seat: seatLong(detail.seat),
    seatShort: detail.seat.label,
    congress: multi ? `Tracking ${tracked} Congress` : `${tracked} Congress`,
    facts: [
      {
        label: 'Current term',
        value: `${formatDate(detail.term.start_date)} – ${formatDate(detail.term.end_date)}`,
      },
      {
        label: 'Roll calls',
        value: formatNumber(rollCalls),
        note: multi ? `in the ${tracked}` : 'to date',
      },
      ...serviceFacts(detail),
    ],
    leadershipTitle: detail.leadership.find((r) => r.is_current)?.title ?? null,
    caucusNote: caucus ? `Caucuses with ${PARTY_MEMBERS[caucus]}` : null,
    photoUrl: detail.photo_url,
  };
}

/** Party unity shows the CQ-style figure (opposing party majorities), the one comparable to
 *  published vote studies; for an Independent it is scored against the caucus (ADR 0005) and
 *  the note says so. Chairmanships is the mart column (full committees, joint included). */
export function buildStats(detail: MemberDetail): Stat[] {
  const v = detail.votes;
  const chairs = detail.activity.chairmanships;
  const tracked = `${ordinal(detail.term.tracked_congress)} Congress`;
  const caucus = caucusParty(detail);
  return [
    {
      label: 'Attendance',
      value: formatPercent(v.attendance_pct),
      note: `${formatNumber(v.votes_cast)} of ${formatNumber(v.positions)} roll calls`,
    },
    {
      label: 'Party unity',
      value: formatPercent(v.party_unity_cq_pct),
      note: caucus ? `votes with ${caucus} caucus` : 'votes with party majority',
    },
    { label: 'Bills sponsored', value: formatNumber(detail.activity.bills_sponsored), note: tracked },
    {
      label: 'Bills cosponsored',
      value: formatNumber(detail.activity.bills_cosponsored),
      note: tracked,
    },
    {
      label: 'Committees',
      value: formatNumber(detail.activity.committees),
      note:
        chairs === 0
          ? 'no full committee chairs'
          : `${chairs} full committee ${chairs === 1 ? 'chair' : 'chairs'}`,
    },
  ];
}

export function buildTerm(detail: MemberDetail): TermModel {
  const start = parseDate(detail.term.start_date);
  const end = parseDate(detail.term.end_date);
  return {
    start: formatDate(detail.term.start_date),
    end: formatDate(detail.term.end_date),
    elapsed: detail.term.days_elapsed,
    total: daysBetween(start, end),
  };
}

const VOTE_LEAD = /^(Voted .+? on |Did not vote on )([\s\S]*)$/;

/** The bill page for a feed event, when the event names a bill that has one.
 *
 *  mart.member_feed sets bill_label only for legislation that is in mart.bill, which is
 *  exactly when a page exists, so the frontend never has to guess. A nomination vote, a
 *  procedural roll call, or a committee action on a bill with no page returns undefined and
 *  the row keeps its source link instead. */
export function billDetailsHref(item: FeedItem): string | undefined {
  if (!item.bill_label || !item.bill_type || !item.bill_number) return undefined;
  return billPath(item.congress, item.bill_type, item.bill_number);
}

/** Split a mart.member_feed vote headline into the bold position and the rest. */
export function feedRow(item: FeedItem): FeedRow {
  const type = EVENT_TYPE_FROM_MART[item.event_type] ?? 'vote';
  const source = item.url ?? item.source_url;
  const secondary = item.detail ?? '';
  const secondaryFull = item.detail_full && item.detail_full !== secondary ? item.detail_full : undefined;
  const detailsHref = billDetailsHref(item);
  if (type === 'vote') {
    const m = VOTE_LEAD.exec(item.headline);
    if (m) {
      return {
        type,
        lead: m[1].replace(/ on $/, ' '),
        headline: `on ${m[2]}`,
        secondary,
        secondaryFull,
        source,
        detailsHref,
        policyArea: item.policy_area,
        isoDate: item.event_date,
      };
    }
  }
  return {
    type,
    headline: item.headline,
    secondary,
    secondaryFull,
    source,
    detailsHref,
    policyArea: item.policy_area,
    isoDate: item.event_date,
  };
}

export type VotePosition = 'Yea' | 'Nay' | 'Present' | 'Not Voting' | 'Other';

export interface VoteRow {
  key: string;
  position: VotePosition;
  /** The bill, nomination or roll call the vote was on: "H.R. 3424: Title". */
  subject: string;
  /** "On Passage · Passed 219–213", the question and result the mart carries. */
  secondary: string;
  secondaryFull?: string;
  date: string;
  isoDate: string;
  policyArea: string | null;
  /** The bill page here when the mart says there is one, else the public roll-call record. */
  detailsHref?: string;
  source: string;
}

const VOTE_POSITIONS: VotePosition[] = ['Yea', 'Nay', 'Present', 'Not Voting'];

/** Roll-call votes from mart.member_feed (event_type vote), in the API's order, newest first. */
export function buildVoteRows(items: FeedItem[]): VoteRow[] {
  return items
    .filter((item) => item.event_type === 'vote')
    .map((item) => {
      const row = feedRow(item);
      const position = VOTE_POSITIONS.find((p) => p === item.position) ?? 'Other';
      return {
        key: item.event_key,
        position,
        subject: row.headline.replace(/^on /, ''),
        secondary: row.secondary,
        secondaryFull: row.secondaryFull,
        date: formatDate(item.event_date),
        isoDate: item.event_date,
        policyArea: item.policy_area,
        detailsHref: row.detailsHref,
        source: row.source,
      };
    });
}

export interface FactRow {
  label: string;
  value: string;
  note?: string;
}

/** The "Current term" card: where the member sits and how long the term runs. Every value is
 *  a mart.member_summary column or the term block of GET /members/{id}. */
export function buildTermFacts(detail: MemberDetail): FactRow[] {
  const t = detail.term;
  const caucus = caucusParty(detail);
  const firstTracked = t.congresses[0];
  const lastTracked = t.congresses[t.congresses.length - 1];
  return [
    { label: 'Seat', value: seatLong(detail.seat) },
    {
      label: 'Party',
      value: partyName(detail.party),
      ...(caucus ? { note: `Caucuses with ${PARTY_MEMBERS[caucus]}` } : {}),
    },
    { label: 'Term starts', value: formatLongDate(t.start_date) },
    { label: 'Term ends', value: formatLongDate(t.end_date) },
    {
      label: 'Days remaining',
      value: formatNumber(Math.max(0, t.days_remaining)),
      note: `${formatNumber(t.days_elapsed)} elapsed`,
    },
    {
      label: 'Congresses',
      value:
        firstTracked === lastTracked
          ? congressLabel(firstTracked)
          : `${ordinal(firstTracked)}–${congressLabel(lastTracked)}`,
    },
  ];
}

export interface RecordModel {
  stats: FactRow[];
  /** One row per term served, oldest first. */
  history: FactRow[];
}

/** The "Record" card: the vote figures behind the stat strip, in full, and the member's
 *  terms in office. */
export function buildRecord(detail: MemberDetail): RecordModel {
  const v = detail.votes;
  const tracked = ordinal(detail.term.tracked_congress);
  const caucus = caucusParty(detail);
  return {
    stats: [
      {
        label: 'Votes cast',
        value: formatNumber(v.votes_cast),
        note: `of ${formatNumber(v.positions)} roll calls in the ${tracked}`,
      },
      { label: 'Not voting', value: formatNumber(v.not_voting) },
      { label: 'Missed votes', value: formatPercent(v.missed_vote_pct) },
      {
        label: 'Party unity, all party votes',
        value: formatPercent(v.party_unity_pct),
        note: `scored against the ${caucus ? `${caucus} caucus` : 'party majority'}; the header shows the CQ figure`,
      },
    ],
    history: detail.service.terms.map((t, i) => ({
      label: `${ordinal(i + 1)} term`,
      value: `${chamberName(t.chamber)} · ${parseDate(t.start_date).getUTCFullYear()}–${parseDate(t.end_date).getUTCFullYear()}`,
      note: t.state + (t.chamber === 'house' && t.district !== null ? `-${t.district || 'AL'}` : ''),
    })),
  };
}

export function buildKeyDates(dates: KeyDate[]): KeyDateRow[] {
  return [...dates]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ date: formatDate(d.date), label: d.label }));
}

/** The next election-kind key date on or after `today` (else the most recent one), or null. */
export function buildElection(dates: KeyDate[], detail: MemberDetail, today: Date): ElectionModel | null {
  const elections = dates.filter((d) => d.kind === 'election').sort((a, b) => a.date.localeCompare(b.date));
  if (elections.length === 0) return null;
  const todayIso = toIsoDate(today);
  const next = elections.find((d) => d.date >= todayIso) ?? elections[elections.length - 1];
  const electionDate = parseDate(next.date);
  const termEnd = parseDate(detail.term.end_date);
  return {
    date: formatDate(next.date),
    daysAway: daysBetween(today, electionDate),
    kind: next.label,
    // The seat is on the ballot when the term ends in the January after the election.
    onBallot: termEnd.getUTCFullYear() === electionDate.getUTCFullYear() + 1 && termEnd.getUTCMonth() === 0,
    opponent: null,
    rating: null,
  };
}

export function lastUpdated(freshness: FreshnessResponse): string | null {
  const latest = freshness.sources.map((s) => s.fetched_at).sort().at(-1);
  return latest ? formatTimestampUtc(latest) : null;
}

export function buildIndexRow(item: MemberListItem, detail: MemberDetail): IndexRow {
  return {
    bioguideId: item.bioguide_id,
    name: memberDisplayName(item.seat.chamber, item.name.official_full),
    lastName: item.name.last,
    party: partyName(detail.party ?? item.party),
    chamber: chamberName(item.seat.chamber),
    state: item.seat.state_name ?? item.seat.state,
    seatShort: item.seat.label,
    attendance: detail.votes.attendance_pct,
    sponsored: detail.activity.bills_sponsored,
    unity: detail.votes.party_unity_cq_pct,
    photoUrl: item.photo_url ?? detail.photo_url,
  };
}

export interface FundraisingStat {
  label: string;
  value: string;
  note?: string;
  title?: string;
}

export interface ShareRow {
  label: string;
  /** Formatted dollar amount, shown on hover. */
  amount: string;
  /** Bar width: the mart share, clamped to 0..100 for rendering only. */
  pct: number;
  pctLabel: string;
  /** One-line explanation under the row, for sources readers may not recognise. */
  note?: string;
}

export interface FundraisingModel {
  cycleLabel: string;
  filed: boolean;
  stats: FundraisingStat[];
  shares: ShareRow[];
  /** What is missing, when not filed. */
  message: string | null;
  /** Coverage and committee lines under the card. */
  footer: string[];
  /** FEC.gov page for the committee (or the candidate when there is no committee). */
  sourceUrl: string | null;
}

/** Receipt sources in display order. The first row is the small-donor share (it is the
 *  same mart column, small_donor_pct = individual_small_pct), so it is not repeated as a
 *  headline stat. */
const SHARE_ROWS: {
  key: keyof NonNullable<FundraisingResponse['receipts']>;
  label: string;
  note?: string;
}[] = [
  { key: 'individual_small', label: 'Small donors: individuals, $200 and under' },
  { key: 'individual_large', label: 'Individuals, over $200' },
  { key: 'pac', label: 'PACs' },
  { key: 'party', label: 'Party committees' },
  { key: 'self_funding', label: 'Self-funding' },
  {
    key: 'transfers',
    label: 'Transfers from authorized committees',
    note: 'Money moved in from a joint fundraising committee or a prior campaign account of the same candidate.',
  },
  { key: 'other', label: 'Other receipts' },
];

function committeeLabel(name: string | null, id: string): string {
  return name ? titleCase(name) : id;
}

/** Fundraising panel from a mart.member_fundraising row. Shares are the mart *_pct columns;
 *  rows with nothing in them are left out so the card stays the size of its placeholder. */
export function buildFundraising(
  f: FundraisingResponse,
  chamber: 'house' | 'senate',
): FundraisingModel {
  const cycle = cycleLabel(f.cycle);
  const seat = chamber === 'house' ? 'House' : 'Senate';
  if (f.status !== 'filed' || !f.totals || !f.receipts || !f.coverage) {
    const committee = f.committee ? committeeLabel(f.committee.name, f.committee.committee_id) : null;
    const message =
      f.status === 'no_candidate'
        ? `The FEC has no ${seat} candidate record for this member, so there are no filings to show.`
        : f.status === 'no_committee'
          ? `No principal campaign committee is registered with the FEC for the ${cycle}.`
          : `${committee ?? 'The principal campaign committee'} has not filed a report covering the ${cycle} yet.`;
    return {
      cycleLabel: cycle,
      filed: false,
      stats: [],
      shares: [],
      message,
      footer: committee ? [committee] : f.candidate ? [`FEC candidate ${f.candidate.candidate_id}`] : [],
      sourceUrl: f.committee?.fec_url ?? f.candidate?.fec_url ?? null,
    };
  }
  const t = f.totals;
  const stats: FundraisingStat[] = [
    { label: 'Raised', value: formatMoney(t.raised), title: 'Total receipts this cycle' },
    { label: 'Spent', value: formatMoney(t.spent), title: 'Total disbursements this cycle' },
    {
      label: 'Cash on hand',
      value: formatMoney(t.cash_on_hand),
      note: t.debts > 0 ? `${formatMoney(t.debts)} in debts` : 'no debts',
      title: 'At the end of the latest report',
    },
  ];
  // Every source with any money in it, dollar amount alongside the share so a small source
  // ($15 of self-funding) reads as $15, not as 0.0%. Only exactly-zero rows are left out.
  const shares: ShareRow[] = SHARE_ROWS.filter((r) => f.receipts![r.key].amount > 0).map((r) => {
    const src = f.receipts![r.key];
    return {
      label: r.label,
      amount: formatMoney(src.amount),
      pct: Math.min(100, Math.max(0, src.pct ?? 0)),
      pctLabel: formatShare(src.pct),
      note: r.note,
    };
  });
  const report = f.coverage.last_report_type ? ` · ${titleCase(f.coverage.last_report_type)} report` : '';
  return {
    cycleLabel: cycle,
    filed: true,
    stats,
    shares,
    message: null,
    footer: [
      `Through ${formatDate(f.coverage.end_date)}${report}`,
      `${committeeLabel(f.committee?.name ?? null, f.committee?.committee_id ?? '')} · principal campaign committee`,
    ],
    sourceUrl: f.committee?.fec_url ?? null,
  };
}

/* ---------------------------------------------------------------- bill detail page */

const ALLOWED_SUMMARY_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'ul',
  'ol',
  'li',
  'span',
  'sup',
  'sub',
]);

/** CRS summaries arrive as HTML. Only a fixed set of formatting tags survives, and every
 *  attribute is dropped, so nothing from the payload can carry a link, a style, or a handler
 *  into the page. Text inside a dropped tag is kept; script and style bodies are not. */
export function sanitizeSummaryHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, rawTag: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_SUMMARY_TAGS.has(tag)) return '';
      // rebuilt from the tag name alone, so no attribute survives and <BR/> becomes <br>
      return match.startsWith('</') ? `</${tag}>` : `<${tag}>`;
    });
}

export interface SummaryVersionRow {
  label: string;
  date: string;
  current: boolean;
}

export interface BillSummaryModel {
  asOf: string;
  stage: string;
  html: string;
  versions: SummaryVersionRow[];
}

export interface ActionGroup {
  date: string;
  items: { text: string; meta: string }[];
}

export interface CosponsorRow {
  name: string;
  meta: string;
  date: string;
  withdrawn: boolean;
  href: string | null;
}

export interface CosponsorsModel {
  total: number;
  /** Corner line: "53 recorded - earliest first". */
  meta: string;
  /** Pre-pluralised party counts, e.g. "1 Democrat", "12 Republicans". */
  chips: { label: string; count: number }[];
  rows: CosponsorRow[];
  withdrawn: number;
}

export interface PositionSummaryLine {
  label: string;
  text: string;
}

export interface RollCallRow {
  /** Element id of the row, which the vote journey links to. */
  anchor: string;
  heading: string;
  question: string | null;
  tally: string;
  detail: string;
  positions: { name: string; party: string | null; position: string }[];
  /** Party breakdown of `positions` ("Yea: R 5 · D 3"), for the card once the chip list is
   *  long enough that reading every chip stops being the fastest way to answer "which way did
   *  it split" (RollCallCard). Empty when there are no positions. */
  positionSummary: PositionSummaryLine[];
  source: string;
}

const PARTY_LETTER: Record<PartyName, string> = { Republican: 'R', Democratic: 'D', Independent: 'I' };

/** Compact party breakdown of a roll call's tracked-member positions, e.g. "Yea: R 5 · D 3 · I 2".
 *  A plain count line in the card's existing navy-monochrome palette, not the whole-chamber vote
 *  bar's party colors (see VoteBar in BillJourney.tsx) -- with a dozen or so tracked members a
 *  proportional bar would be mostly unreadable slivers, so this stays text. */
export function rollCallPositionSummary(
  positions: { party: string | null; position: string }[],
): PositionSummaryLine[] {
  const buckets: Record<string, Partial<Record<string, number>>> = { Yea: {}, Nay: {}, 'Not voting': {} };
  for (const p of positions) {
    const label = p.position === 'Yea' ? 'Yea' : p.position === 'Nay' ? 'Nay' : 'Not voting';
    const letter = PARTY_LETTER[partyName(p.party)];
    buckets[label][letter] = (buckets[label][letter] ?? 0) + 1;
  }
  return (['Yea', 'Nay', 'Not voting'] as const)
    .map((label) => ({
      label,
      text: ['R', 'D', 'I']
        .filter((letter) => (buckets[label][letter] ?? 0) > 0)
        .map((letter) => `${letter} ${buckets[label][letter]}`)
        .join(' · '),
    }))
    .filter((line) => line.text !== '');
}

export interface BillPageModel {
  label: string;
  title: string;
  kindLabel: string;
  congress: string;
  policyArea: string | null;
  introduced: string;
  sponsorName: string;
  sponsorMeta: string;
  sponsorHref: string | null;
  latestAction: { date: string; text: string } | null;
  amends: { label: string; href: string } | null;
  congressGovUrl: string;
  summary: BillSummaryModel | null;
  summaryEmpty: string | null;
  actions: ActionGroup[];
  actionCount: number;
  /** Corner line for the action card, the treatment the other two cards now match. */
  actionsMeta: string;
  cosponsors: CosponsorsModel;
  rollCalls: RollCallRow[];
  rollCallsMeta: string;
  /** Shown stages of mart.bill_journey_stage; empty for amendments. */
  journey: JourneyStageModel[];
  /** Days between the first and last shown journey stage's dates; null with fewer than two. */
  journeyDurationDays: number | null;
}

export type JourneyTone = 'done' | 'failed' | 'neutral' | 'pending';

export interface VoteSegmentModel {
  key: string;
  direction: 'Yea' | 'Nay' | 'Not voting';
  /** null for the non-R/D bucket, which reads in the neutral "not voting" tone, not a third party color. */
  party: 'R' | 'D' | null;
  count: number;
  /** Share of the vote total (yea + nay + present + not voting): one bar, one scale. */
  pct: number;
  color: string;
  /** Full sentence for the bar's aria-label, e.g. "Yea · Republican 215". */
  label: string;
  /** Legend row text before the count, e.g. "Yea · Republican", "Not voting". */
  legendLabel: string;
  /** Inline label drawn in white on the segment itself, abbreviated to fit: "215 YEA · R". Only
   *  rendered when the segment is a leader and wide enough. */
  barLabel: string;
  /** The larger of R/D within this direction: the only segment wide enough to carry its own
   *  inline label on the bar (Bill Detail Redesign mockup). */
  isLeader: boolean;
}

/** One bar for the whole vote -- Yea then Nay then Not voting, left to right -- rather than a
 *  bar per direction, so the chamber's split reads as a single line (see design-refactor-bills). */
export interface VoteBarModel {
  segments: VoteSegmentModel[];
  ariaLabel: string;
}

export interface JourneyVoteModel {
  chamber: 'house' | 'senate';
  tally: string;
  yeaCount: number;
  nayCount: number;
  notVotingCount: number;
  href: string;
  linkLabel: string;
  majority: string | null;
  /** A tied vote that passed can only have passed on the Vice President's constitutional
   *  tie-breaking vote (Senate only; the House has no equivalent mechanism). Derived from the
   *  tally already on the row, not a new data source. */
  tiebreak: boolean;
  bar: VoteBarModel;
}

export interface JourneyStageModel {
  key: string;
  label: string;
  statusLabel: string;
  tone: JourneyTone;
  date: string | null;
  detail: string | null;
  endsJourney: boolean;
  vote: JourneyVoteModel | null;
}

const JOURNEY_TONE: Record<JourneyStatus, JourneyTone> = {
  complete: 'done',
  passed: 'done',
  failed: 'failed',
  vetoed: 'failed',
  no_roll_call: 'neutral',
  not_recorded: 'neutral',
  pending: 'pending',
};

/* Only the two parties that organize the chamber get their own color on the vote bar (also the
   tailwind.config.js rule: party colors never become page chrome). Everyone else -- Independents,
   any other letter -- reads in the same neutral gray as "not voting", not a third hue: distinct
   from the party.i badge color, which is a different, member-identity context. Within a
   direction (Yea or Nay), whichever of R/D cast more votes gets its full party color; the other
   gets a lighter tint of its own color, so a large majority and a small crossover read at a
   glance without a legend (see design-refactor-bills PR, and the "Bill Detail Redesign" mockup
   this reproduces). */
const RED = '#B8202F';
const RED_TINT = '#E3A5AB';
const BLUE = '#1F4F92';
const BLUE_TINT = '#ABC0DD';
const NEUTRAL = '#676E75'; // shared by "not voting" and any non-R/D position on the bar
const PARTY_WORD: Record<string, string> = { D: 'Democrat', R: 'Republican', I: 'Independent' };

/** Element id of a roll call's row in the bill page's Roll calls card. */
export function rollCallAnchor(chamber: string, session: number, rollNumber: number): string {
  return `roll-call-${chamber}-${session}-${rollNumber}`;
}

/** The word for the bar's non-R/D bucket: the one other letter's full party name (congressional
 *  vote records realistically carry only R, D and I), or "Other" when more than one is mixed
 *  together. */
function otherPartyWord(otherParties: { party: string; count: number }[]): string {
  const distinct = otherParties.filter((p) => p.count > 0);
  if (distinct.length === 1) return PARTY_WORD[distinct[0].party] ?? distinct[0].party;
  return 'Other';
}

function directionSegments(
  direction: 'Yea' | 'Nay',
  rCount: number,
  dCount: number,
  otherParties: { party: string; count: number }[],
  total: number,
): VoteSegmentModel[] {
  const rLeads = rCount >= dCount;
  const segments: VoteSegmentModel[] = [];
  if (rCount > 0) {
    segments.push({
      key: `${direction}-R`,
      direction,
      party: 'R',
      count: rCount,
      pct: (rCount / total) * 100,
      color: rLeads ? RED : RED_TINT,
      label: `${direction} · Republican ${formatNumber(rCount)}`,
      legendLabel: `${direction} · Republican`,
      barLabel: `${formatNumber(rCount)} ${direction.toUpperCase()} · R`,
      isLeader: rLeads,
    });
  }
  if (dCount > 0) {
    segments.push({
      key: `${direction}-D`,
      direction,
      party: 'D',
      count: dCount,
      pct: (dCount / total) * 100,
      color: rLeads ? BLUE_TINT : BLUE,
      label: `${direction} · Democrat ${formatNumber(dCount)}`,
      legendLabel: `${direction} · Democrat`,
      barLabel: `${formatNumber(dCount)} ${direction.toUpperCase()} · D`,
      isLeader: !rLeads,
    });
  }
  const otherCount = otherParties.reduce((sum, p) => sum + p.count, 0);
  if (otherCount > 0) {
    const word = otherPartyWord(otherParties);
    segments.push({
      key: `${direction}-other`,
      direction,
      party: null,
      count: otherCount,
      pct: (otherCount / total) * 100,
      color: NEUTRAL,
      label: `${direction} · ${word} ${formatNumber(otherCount)}`,
      legendLabel: `${direction} · ${word}`,
      barLabel: `${formatNumber(otherCount)} ${direction.toUpperCase()} · ${word}`,
      isLeader: false,
    });
  }
  return segments;
}

/** One bar for the whole vote: Yea (by party), then Nay (by party), then Not voting, each
 *  segment's width its share of the vote total. Counts are mart.bill_passage_vote columns; the
 *  shares are computed here (there is no mart column at this grain), the same category of
 *  frontend arithmetic as every other width-from-a-count bar on the site. */
function voteBar(vote: PassageVote): VoteBarModel {
  const total = vote.yea_total + vote.nay_total + vote.present_total + vote.not_voting_total;
  const count = (party: string, direction: 'yea' | 'nay') =>
    vote.parties.find((p) => p.party === party)?.[direction] ?? 0;
  const otherParties = (direction: 'yea' | 'nay') =>
    vote.parties
      .filter((p) => p.party !== 'R' && p.party !== 'D')
      .map((p) => ({ party: p.party, count: p[direction] }));

  const segments = [
    ...directionSegments('Yea', count('R', 'yea'), count('D', 'yea'), otherParties('yea'), total),
    ...directionSegments('Nay', count('R', 'nay'), count('D', 'nay'), otherParties('nay'), total),
  ];
  const notVoting = vote.not_voting_total + vote.present_total;
  if (notVoting > 0) {
    segments.push({
      key: 'not-voting',
      direction: 'Not voting',
      party: null,
      count: notVoting,
      pct: (notVoting / total) * 100,
      color: NEUTRAL,
      label: `Not voting ${formatNumber(notVoting)}`,
      legendLabel: 'Not voting',
      barLabel: `${formatNumber(notVoting)} NOT VOTING`,
      isLeader: false,
    });
  }
  return { segments, ariaLabel: segments.map((s) => s.label).join(', ') };
}

/** Calendar days between the first and last shown stage's dates ("Bill Detail Redesign" mockup
 *  header, e.g. "45 days"); null when fewer than two stages carry a date. Pure arithmetic on
 *  dates the journey already has, not a new figure from the mart. */
function journeyDurationDays(stages: JourneyStage[]): number | null {
  const dates = stages.map((s) => s.date).filter((d): d is string => d !== null);
  if (dates.length < 2) return null;
  return daysBetween(parseDate(dates[0]), parseDate(dates[dates.length - 1]));
}

/** The vote journey from GET /bills/{congress}/{type}/{number} `journey`: labels, statuses,
 *  dates and bar widths are mart columns; this only formats them and picks the tone. */
export function buildJourney(stages: JourneyStage[]): JourneyStageModel[] {
  return stages.map((stage) => ({
    key: stage.stage_key,
    label: stage.label,
    statusLabel: stage.status_label,
    tone: JOURNEY_TONE[stage.status],
    date: stage.date ? formatDate(stage.date) : null,
    // a vote stage's status already says Passed or Failed; its question says what was voted on
    detail: stage.vote ? stage.vote.question : stage.detail,
    endsJourney: stage.ends_journey,
    vote: stage.vote
      ? {
          chamber: stage.vote.chamber === 'house' ? 'house' : 'senate',
          tally: `${stage.vote.yea_total}–${stage.vote.nay_total}`,
          yeaCount: stage.vote.yea_total,
          nayCount: stage.vote.nay_total,
          // folded with `present`, same as the bar's own not-voting segment (both are 0 for
          // nearly every passage vote; see mart.bill_passage_vote in the data dictionary)
          notVotingCount: stage.vote.not_voting_total + stage.vote.present_total,
          href: `#${rollCallAnchor(stage.vote.chamber, stage.vote.session, stage.vote.roll_number)}`,
          linkLabel: `${stage.vote.chamber === 'house' ? 'House' : 'Senate'} roll call ${stage.vote.roll_number}`,
          majority: stage.vote.majority_label,
          // The Senate breaks a tie with the Vice President's constitutional vote; the House has
          // no equivalent, so a tied House vote can only be a tied failure, never "VP tiebreak".
          tiebreak:
            stage.vote.chamber === 'senate' &&
            stage.vote.passed &&
            stage.vote.yea_total === stage.vote.nay_total,
          bar: voteBar(stage.vote),
        }
      : null,
  }));
}

/** "R-WI-1" for a representative, "R-AR" for a senator, "" when the source says neither. */
export function memberMeta(
  party: string | null,
  state: string | null,
  district: number | null,
): string {
  const parts = [party, state].filter(Boolean);
  const base = parts.join('-');
  return district === null || district === undefined ? base : `${base}-${district}`;
}

function summaryModel(detail: BillDetail): BillSummaryModel | null {
  if (!detail.summary) return null;
  const versionRow = (v: BillSummaryVersion): SummaryVersionRow => ({
    label: v.action_desc,
    date: formatDate(v.action_date),
    current: v.is_latest,
  });
  return {
    asOf: formatDate(detail.summary.action_date),
    stage: detail.summary.action_desc,
    html: sanitizeSummaryHtml(detail.summary.text_html),
    versions: detail.summary_versions.map(versionRow),
  };
}

/** Why there is no summary, in words. CRS writes summaries after introduction and skips many
 *  minor measures, so an absent one is normal and says nothing about the bill. */
function summaryEmptyMessage(detail: BillDetail): string | null {
  if (detail.summary) return null;
  if (detail.kind === 'amendment') {
    return 'The Congressional Research Service does not summarise amendments.';
  }
  return (
    'The Congressional Research Service has not published a summary of this bill. ' +
    'Summaries are written after introduction and many measures never receive one.'
  );
}

function actionGroups(actions: BillAction[]): ActionGroup[] {
  const groups: ActionGroup[] = [];
  for (const a of actions) {
    const date = formatLongDate(a.action_date);
    const meta = [a.action_type, a.source_system].filter(Boolean).join(' · ');
    const item = { text: a.action_text ?? a.action_code ?? 'Action recorded', meta };
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.items.push(item);
    else groups.push({ date, items: [item] });
  }
  return groups;
}

/** "1 Democrat", "12 Democrats". The count is the mart column; only the word changes. */
export function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** The line in a card's top corner, matching the action history's treatment across all three
 *  lists: how many rows and which way they run. */
export function listMeta(count: number, ordering: string): string {
  return count === 0 ? 'None recorded' : `${count} recorded · ${ordering}`;
}

function cosponsorsModel(detail: BillDetail): CosponsorsModel {
  const c = detail.cosponsors;
  const chips = [
    { label: countLabel(c.democratic, 'Democrat', 'Democrats'), count: c.democratic },
    { label: countLabel(c.republican, 'Republican', 'Republicans'), count: c.republican },
    { label: countLabel(c.other, 'other', 'other'), count: c.other },
  ].filter((chip) => chip.count > 0);
  return {
    total: c.total,
    withdrawn: c.withdrawn,
    meta: listMeta(c.total, 'earliest first'),
    chips,
    rows: detail.cosponsor_list.map((p: BillCosponsor) => ({
      name: p.name,
      meta: memberMeta(p.party, p.state, p.district),
      date: formatDate(p.date),
      withdrawn: p.is_withdrawn,
      href: p.is_tracked_member ? `/members/${p.bioguide_id}` : null,
    })),
  };
}

function rollCallRows(detail: BillDetail): RollCallRow[] {
  return detail.roll_calls.map((r: BillRollCall) => ({
    anchor: rollCallAnchor(r.chamber, r.session, r.roll_number),
    heading: `${r.chamber === 'house' ? 'House' : 'Senate'} roll call ${r.roll_number} · ${formatDate(r.vote_date)}`,
    question: r.question,
    tally: `${r.yea_total}–${r.nay_total}`,
    detail: [r.result, `${r.present_total} present`, `${r.not_voting_total} not voting`]
      .filter(Boolean)
      .join(' · '),
    positions: r.tracked_positions.map((p) => ({
      name: p.name,
      party: p.party,
      position: p.position,
    })),
    positionSummary: rollCallPositionSummary(r.tracked_positions),
    source: r.source_url,
  }));
}

/** Everything the bill page renders, from one GET /bills/{congress}/{type}/{number} row.
 *  Formatting and labelling only: every count is an API field, which is a mart column. */
export function buildBillPage(detail: BillDetail): BillPageModel {
  const sponsorParty = detail.sponsor.party;
  return {
    label: detail.label,
    title: detail.title,
    kindLabel: detail.kind === 'amendment' ? 'Amendment' : 'Bill',
    congress: congressLabel(detail.congress),
    policyArea: detail.policy_area,
    introduced: formatDate(detail.introduced_date),
    sponsorName: detail.sponsor.name,
    sponsorMeta: [
      sponsorParty ? PARTY_WORD[sponsorParty] ?? sponsorParty : null,
      memberMeta(null, detail.sponsor.state, detail.sponsor.district),
    ]
      .filter(Boolean)
      .join(' · '),
    sponsorHref:
      detail.sponsor.is_tracked && detail.sponsor.bioguide_id
        ? `/members/${detail.sponsor.bioguide_id}`
        : null,
    latestAction: detail.latest_action_date
      ? {
          date: formatDate(detail.latest_action_date),
          text: detail.latest_action_text ?? '',
        }
      : null,
    amends:
      detail.amended_bill_congress && detail.amended_bill_type && detail.amended_bill_number
        ? {
            label: `${detail.amended_bill_type.toUpperCase()} ${detail.amended_bill_number}`,
            href: billPath(
              detail.amended_bill_congress,
              detail.amended_bill_type,
              detail.amended_bill_number,
            ),
          }
        : null,
    congressGovUrl: detail.congress_gov_url,
    summary: summaryModel(detail),
    summaryEmpty: summaryEmptyMessage(detail),
    actions: actionGroups(detail.actions),
    actionCount: detail.action_count,
    actionsMeta: listMeta(detail.action_count, 'most recent first'),
    cosponsors: cosponsorsModel(detail),
    rollCalls: rollCallRows(detail),
    rollCallsMeta: listMeta(detail.roll_call_count, 'most recent first'),
    journey: buildJourney(detail.journey),
    journeyDurationDays: journeyDurationDays(detail.journey),
  };
}
