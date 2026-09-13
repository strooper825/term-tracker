/** Pure functions from API rows (mart columns) to the props the design components take.
 *  Nothing here computes a statistic; it formats, labels, groups, and fills empty weeks.
 *  Every displayed number traces back to a named mart column (see docs/data-dictionary.md). */

import { EVENT_TYPE_FROM_MART, type EventKey, type PartyName } from '@/data/eventTypes';
import {
  addDays,
  billPath,
  congressLabel,
  congressStartDate,
  cycleLabel,
  daysBetween,
  formatDate,
  formatLongDate,
  formatMoney,
  formatNumber,
  formatPercent,
  formatShare,
  formatTimestampUtc,
  monthShort,
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
  KeyDate,
  MemberDetail,
  MemberListItem,
  WeekBucket,
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
  termLine: string;
  /** "Age 45 · Serving since 2019 · 4th term", plus "· 1st in the Senate" after a chamber change. */
  serviceLine: string;
  /** Current party or chamber leadership title from congress-legislators, if any. */
  leadershipTitle: string | null;
  /** "Caucuses with Democrats" for an Independent; null otherwise. */
  caucusNote: string | null;
  photoUrl: string | null;
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

export interface Week {
  label: string;
  counts: Record<EventKey, number>;
  tick: string;
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
}

export interface FeedGroup {
  date: string;
  items: FeedRow[];
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

/** "Age 45 · Serving since 2019 · 4th term"; members who changed chamber also get
 *  "· 1st in the Senate" so a first-term senator with House service reads correctly. */
export function serviceLine(detail: MemberDetail): string {
  const svc = detail.service;
  const chamber = chamberName(detail.seat.chamber);
  const since = parseDate(svc.serving_since).getUTCFullYear();
  const changedChamber = svc.terms.some((t) => t.chamber !== detail.seat.chamber);
  const parts = [
    ...(detail.bio.age === null ? [] : [`Age ${detail.bio.age}`]),
    `Serving since ${since}`,
    `${ordinal(svc.term_number)} term`,
    ...(changedChamber ? [`${ordinal(svc.chamber_term_number)} in the ${chamber}`] : []),
  ];
  return parts.join(' · ');
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
    termLine:
      `Term: ${formatDate(detail.term.start_date)} – ${formatDate(detail.term.end_date)} · ` +
      `${formatNumber(rollCalls)} roll calls ${multi ? `in the ${tracked}` : 'to date'}`,
    serviceLine: serviceLine(detail),
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

/** Timeline range: the tracked Congress (or the term start, if later) up to `today`. */
export function timelineRange(detail: MemberDetail, today: Date): { from: string; to: string } {
  const congressStart = congressStartDate(detail.term.tracked_congress);
  const termStart = parseDate(detail.term.start_date);
  const from = termStart > congressStart ? termStart : congressStart;
  return { from: toIsoDate(from), to: toIsoDate(today) };
}

/** Minimum columns between two axis labels; at ~8px per week this keeps "Jan 2025" clear of
 *  the next label. */
export const MIN_TICK_GAP_WEEKS = 6;

/** One column per week (Monday to Sunday) across the range, zero-filled. Axis labels sit on the
 *  first week of a month, never closer than MIN_TICK_GAP_WEEKS columns apart, with the year only
 *  on the first label and on January. */
export function buildWeeks(buckets: WeekBucket[], from: string, to: string): Week[] {
  const start = parseDate(from);
  const monday = addDays(start, -((start.getUTCDay() + 6) % 7));
  const end = parseDate(to);
  const byWeek = new Map(buckets.map((b) => [b.week_start, b]));
  const weeks: Week[] = [];
  let lastMonth = -1;
  let lastTickIndex = -MIN_TICK_GAP_WEEKS;
  for (let d = monday; d <= end; d = addDays(d, 7)) {
    const key = toIsoDate(d);
    const b = byWeek.get(key);
    const monthDay = d.getUTCDate() <= 7 ? d : addDays(d, 6);
    const firstOfMonthInWeek = d.getUTCDate() <= 7 || d.getUTCMonth() !== addDays(d, 6).getUTCMonth();
    const month = monthDay.getUTCMonth();
    let tick = '';
    const wantsTick = weeks.length === 0 || (firstOfMonthInWeek && month !== lastMonth);
    if (wantsTick && weeks.length - lastTickIndex >= MIN_TICK_GAP_WEEKS) {
      const withYear = weeks.length === 0 || month === 0;
      tick = `${monthShort(monthDay)}${withYear ? ` ${monthDay.getUTCFullYear()}` : ''}`;
      lastTickIndex = weeks.length;
    }
    if (wantsTick) lastMonth = month;
    weeks.push({
      label: formatDate(key),
      counts: {
        vote: b?.vote ?? 0,
        sponsor: b?.bill_sponsored ?? 0,
        cosponsor: b?.bill_cosponsored ?? 0,
        committee: b?.committee_action ?? 0,
      },
      tick,
    });
  }
  return weeks;
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
      };
    }
  }
  return { type, headline: item.headline, secondary, secondaryFull, source, detailsHref };
}

/** Group feed items by calendar day, newest first (the API already orders by event_at desc). */
export function groupFeed(items: FeedItem[]): FeedGroup[] {
  const groups: FeedGroup[] = [];
  for (const item of items) {
    const date = formatLongDate(item.event_date);
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.items.push(feedRow(item));
    else groups.push({ date, items: [feedRow(item)] });
  }
  return groups;
}

export function eventTotals(items: FeedItem[]): Record<EventKey, number> {
  const totals: Record<EventKey, number> = { vote: 0, sponsor: 0, cosponsor: 0, committee: 0 };
  for (const item of items) totals[EVENT_TYPE_FROM_MART[item.event_type] ?? 'vote'] += 1;
  return totals;
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

export interface RollCallRow {
  heading: string;
  question: string | null;
  tally: string;
  detail: string;
  positions: { name: string; party: string | null; position: string }[];
  source: string;
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
}

const PARTY_WORD: Record<string, string> = { D: 'Democrat', R: 'Republican', I: 'Independent' };

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
  };
}
