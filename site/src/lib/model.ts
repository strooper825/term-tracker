/** Pure functions from API rows (mart columns) to the props the design components take.
 *  Nothing here computes a statistic; it formats, labels, groups, and fills empty weeks.
 *  Every displayed number traces back to a named mart column (see docs/data-dictionary.md). */

import { EVENT_TYPE_FROM_MART, type EventKey, type PartyName } from '@/data/eventTypes';
import {
  addDays,
  congressStartDate,
  daysBetween,
  formatDate,
  formatLongDate,
  formatNumber,
  formatPercent,
  formatTimestampUtc,
  monthShort,
  ordinal,
  parseDate,
  toIsoDate,
} from './format';
import type {
  CommitteeAssignment,
  FeedItem,
  FreshnessResponse,
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
  source: string;
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

export function buildCommitteeRows(committees: CommitteeAssignment[]): CommitteeRow[] {
  const order = (c: CommitteeAssignment) => (committeeRole(c.title) === 'Chair' ? 0 : 1);
  return [...committees]
    .sort((a, b) => order(a) - order(b) || (a.parent_thomas_id ? 1 : 0) - (b.parent_thomas_id ? 1 : 0))
    .map((c) => ({ name: committeeDisplayName(c), role: committeeRole(c.title) }));
}

export function buildHeader(detail: MemberDetail): MemberHeaderModel {
  const chamber = chamberName(detail.seat.chamber);
  const tracked = ordinal(detail.term.tracked_congress);
  const multi = detail.term.congresses.length > 1;
  const rollCalls = detail.votes.roll_calls ?? 0;
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
    photoUrl: detail.photo_url,
  };
}

/** Party unity shows the CQ-style figure (opposing party majorities), the one comparable to
 *  published vote studies; chairmanships is the mart column (full committees, own chamber). */
export function buildStats(detail: MemberDetail): Stat[] {
  const v = detail.votes;
  const chairs = detail.activity.chairmanships;
  const tracked = `${ordinal(detail.term.tracked_congress)} Congress`;
  return [
    {
      label: 'Attendance',
      value: formatPercent(v.attendance_pct),
      note: `${formatNumber(v.votes_cast)} of ${formatNumber(v.positions)} roll calls`,
    },
    {
      label: 'Party unity',
      value: formatPercent(v.party_unity_cq_pct),
      note: 'votes with party majority',
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
      note: chairs === 0 ? 'no chairmanships' : `${chairs} ${chairs === 1 ? 'chairmanship' : 'chairmanships'}`,
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

/** One column per week (Monday to Sunday) across the range, zero-filled. */
export function buildWeeks(buckets: WeekBucket[], from: string, to: string): Week[] {
  const start = parseDate(from);
  const monday = addDays(start, -((start.getUTCDay() + 6) % 7));
  const end = parseDate(to);
  const byWeek = new Map(buckets.map((b) => [b.week_start, b]));
  const weeks: Week[] = [];
  let lastMonth = -1;
  for (let d = monday; d <= end; d = addDays(d, 7)) {
    const key = toIsoDate(d);
    const b = byWeek.get(key);
    const firstOfMonthInWeek = d.getUTCDate() <= 7 || d.getUTCMonth() !== addDays(d, 6).getUTCMonth();
    const month = d.getUTCDate() <= 7 ? d.getUTCMonth() : addDays(d, 6).getUTCMonth();
    let tick = '';
    if (weeks.length === 0 || (firstOfMonthInWeek && month !== lastMonth)) {
      tick = `${monthShort(d.getUTCDate() <= 7 ? d : addDays(d, 6))}${month === 0 || weeks.length === 0 ? ` ${(d.getUTCDate() <= 7 ? d : addDays(d, 6)).getUTCFullYear()}` : ''}`;
      lastMonth = month;
    }
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

/** Split a mart.member_feed vote headline into the bold position and the rest. */
export function feedRow(item: FeedItem): FeedRow {
  const type = EVENT_TYPE_FROM_MART[item.event_type] ?? 'vote';
  const source = item.url ?? item.source_url;
  const secondary = item.detail ?? '';
  if (type === 'vote') {
    const m = VOTE_LEAD.exec(item.headline);
    if (m) {
      return { type, lead: m[1].replace(/ on $/, ' '), headline: `on ${m[2]}`, secondary, source };
    }
  }
  return { type, headline: item.headline, secondary, source };
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
  };
}
