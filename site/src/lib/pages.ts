/** Assemble page props from the API at build time (server side only). */
import { api } from './api';
import { formatNumber, ordinal } from './format';
import {
  buildCommitteeRows,
  buildElection,
  buildFundraising,
  buildHeader,
  buildIndexRow,
  buildKeyDates,
  buildStats,
  buildTerm,
  buildWeeks,
  eventTotals,
  groupFeed,
  lastUpdated,
  timelineRange,
  type IndexRow,
} from './model';
import type { DashboardProps } from '@/components/MemberDashboard';

export async function trackedBioguides(): Promise<string[]> {
  const { members } = await api.members();
  return members.map((m) => m.bioguide_id);
}

export async function indexPageProps(): Promise<{
  rows: IndexRow[];
  congressLabel: string;
  lastUpdated: string | null;
}> {
  const [{ members }, freshness] = await Promise.all([api.members(), api.freshness()]);
  const details = await Promise.all(members.map((m) => api.member(m.bioguide_id)));
  const rows = members.map((m, i) => buildIndexRow(m, details[i]));
  const tracked = details[0]?.term.tracked_congress;
  return {
    rows,
    congressLabel: tracked ? `${ordinal(tracked)} Congress` : 'Congress',
    lastUpdated: lastUpdated(freshness),
  };
}

export async function dashboardProps(bioguide: string, today = new Date()): Promise<DashboardProps> {
  const detail = await api.member(bioguide);
  const range = timelineRange(detail, today);
  const [timeline, feed, committees, keyDates, fundraising, freshness] = await Promise.all([
    api.timeline(bioguide, range.from, range.to),
    api.feedAll(bioguide),
    api.committees(bioguide),
    api.keyDates(bioguide),
    api.fundraising(bioguide),
    api.freshness(),
  ]);
  const totals = eventTotals(feed);
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  return {
    member: buildHeader(detail),
    stats: buildStats(detail),
    term: buildTerm(detail),
    weeks: buildWeeks(timeline.weeks, range.from, range.to),
    feedGroups: groupFeed(feed),
    eventTotals: totals,
    totalLabel: formatNumber(total),
    election: buildElection(keyDates.items, detail, today),
    committees: buildCommitteeRows(committees.items),
    keyDates: buildKeyDates(keyDates.items),
    fundraising: buildFundraising(fundraising, detail.seat.chamber),
    lastUpdated: lastUpdated(freshness),
  };
}
