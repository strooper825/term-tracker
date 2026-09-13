// Ported from design/src/pages/MemberDashboard.jsx. Server component: every prop is built at
// build time in src/lib/model.ts from API rows; the two client islands (timeline, feed) only
// filter and hover.
import type { EventKey } from '@/data/eventTypes';
import type {
  CommitteeRow,
  ElectionModel,
  FeedGroup,
  KeyDateRow,
  MemberHeaderModel,
  Stat,
  TermModel,
  Week,
} from '@/lib/model';
import { ActivityFeed } from './ActivityFeed';
import { ActivityTimeline } from './ActivityTimeline';
import { MemberHeader, StatStrip, TermProgress } from './MemberHeader';
import { CommitteesCard, KeyDatesCard, LockedPanels, NextElectionCard } from './SideCards';
import { Breadcrumb, SiteFooter, SiteHeader } from './SiteChrome';

export interface DashboardProps {
  member: MemberHeaderModel;
  stats: Stat[];
  term: TermModel;
  weeks: Week[];
  feedGroups: FeedGroup[];
  eventTotals: Record<EventKey, number>;
  totalLabel: string;
  election: ElectionModel | null;
  committees: CommitteeRow[];
  keyDates: KeyDateRow[];
  lastUpdated: string | null;
}

export function lockedPanels(member: MemberHeaderModel) {
  return [
    {
      title: 'Fundraising',
      desc: 'Receipts, disbursements and top contributor categories from FEC filings.',
    },
    { title: 'Stock trades', desc: 'Periodic transaction reports filed under the STOCK Act.' },
    {
      title: 'Public statements',
      desc: 'Press releases, floor remarks and newsletter archives.',
    },
    {
      title: member.chamber === 'Senate' ? 'State map' : 'District map',
      desc:
        member.chamber === 'Senate'
          ? `Statewide map, county results and ${member.state} demographics.`
          : `${member.seatShort} boundaries, county splits and district demographics.`,
    },
  ];
}

export function MemberDashboard(props: DashboardProps) {
  const { member } = props;
  return (
    <div className="min-h-screen bg-canvas flex justify-center">
      <div className="w-full max-w-[1280px] bg-sheet border-x border-rule">
        <SiteHeader active="Members" />

        <section className="px-7 pt-5 pb-7 border-b border-rule flex flex-col gap-[18px]">
          <Breadcrumb name={member.name} />
          <MemberHeader member={member} />
          <StatStrip stats={props.stats} />
          <TermProgress term={props.term} />
        </section>

        <main className="px-7 py-7 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-7 items-start">
          <div className="flex flex-col gap-7 min-w-0">
            <ActivityTimeline weeks={props.weeks} />
            <ActivityFeed
              groups={props.feedGroups}
              totals={props.eventTotals}
              totalLabel={props.totalLabel}
            />
          </div>
          <div className="flex flex-col gap-5 min-w-0">
            <NextElectionCard election={props.election} />
            <CommitteesCard committees={props.committees} />
            <KeyDatesCard dates={props.keyDates} />
          </div>
        </main>

        <LockedPanels panels={lockedPanels(member)} />
        <SiteFooter lastUpdated={props.lastUpdated} />
      </div>
    </div>
  );
}
