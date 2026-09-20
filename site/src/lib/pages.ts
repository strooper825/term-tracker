/** Assemble page props from the API at build time (server side only). */
import { api } from './api';
import { buildCongressModel, type CongressModel } from './congress';
import { congressLabel, ordinal } from './format';
import {
  buildBillPage,
  buildCommitteeRows,
  buildContact,
  buildStatements,
  buildElection,
  buildFundraising,
  buildHeader,
  buildIndexRow,
  buildDateRanges,
  buildKeyDates,
  buildRecord,
  buildStats,
  buildTerm,
  buildVoteRows,
  lastUpdated,
  policyAreaTotals,
  type IndexRow,
} from './model';
import type { DashboardProps } from '@/components/MemberDashboard';
import type { BillPageProps } from '@/components/BillPage';

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

export async function congressPageProps(): Promise<{
  model: CongressModel;
  lastUpdated: string | null;
}> {
  const [overview, freshness] = await Promise.all([api.congressOverview(), api.freshness()]);
  return { model: buildCongressModel(overview), lastUpdated: lastUpdated(freshness) };
}

export async function dashboardProps(bioguide: string, today = new Date()): Promise<DashboardProps> {
  const [detail, feed, committees, contact, statements, keyDates, fundraising, freshness, sessions] =
    await Promise.all([
    api.member(bioguide),
    api.feedAll(bioguide),
    api.committees(bioguide),
    api.contact(bioguide),
    api.statements(bioguide),
    api.keyDates(bioguide),
    api.fundraising(bioguide),
    api.freshness(),
    api.sessions(),
  ]);
  return {
    member: buildHeader(detail),
    stats: buildStats(detail),
    term: buildTerm(detail),
    votes: buildVoteRows(feed),
    congressLabel: congressLabel(detail.term.tracked_congress),
    policyAreas: policyAreaTotals(feed),
    // The rolling windows count back from the latest ingest rather than the build clock, so
    // every boundary the filter uses comes from data.
    dateRanges: buildDateRanges(sessions.sessions, detail.term, latestIngest(freshness, today)),
    record: buildRecord(detail),
    election: buildElection(keyDates.items, detail, today),
    committees: buildCommitteeRows(committees.items),
    contact: buildContact(contact),
    statements: buildStatements(statements),
    keyDates: buildKeyDates(keyDates.items),
    fundraising: buildFundraising(fundraising, detail.seat.chamber),
    lastUpdated: lastUpdated(freshness),
  };
}

/** Route params for every bill with a detail page: one per row of mart.bill. */
export async function billRouteParams(): Promise<
  { congress: string; type: string; number: string }[]
> {
  const bills = await api.billsAll();
  return bills.map((b) => ({
    congress: String(b.congress),
    type: b.bill_type,
    number: b.bill_number,
  }));
}

export async function billPageProps(
  congress: number,
  billType: string,
  billNumber: string,
): Promise<BillPageProps> {
  const [detail, freshness] = await Promise.all([
    api.bill(congress, billType, billNumber),
    api.freshness(),
  ]);
  const bill = buildBillPage(detail);
  const trail = [{ label: 'Members', href: '/members' }];
  if (detail.sponsor.is_tracked && detail.sponsor.bioguide_id) {
    trail.push({ label: bill.sponsorName, href: `/members/${detail.sponsor.bioguide_id}` });
  }
  return { bill, trail, lastUpdated: lastUpdated(freshness) };
}

/** The most recent successful ingest, the anchor for the rolling date windows. Falls back to
 *  `today` on a database with no recorded run. */
function latestIngest(freshness: { sources: { fetched_at: string }[] }, today: Date): Date {
  const latest = freshness.sources.map((s) => s.fetched_at).sort().at(-1);
  return latest ? new Date(latest) : today;
}
