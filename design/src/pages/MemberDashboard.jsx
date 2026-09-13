import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import Breadcrumb from '../components/Breadcrumb';
import MemberHeader from '../components/MemberHeader';
import StatStrip from '../components/StatStrip';
import TermProgress from '../components/TermProgress';
import ActivityTimeline from '../components/ActivityTimeline';
import ActivityFeed from '../components/ActivityFeed';
import NextElectionCard from '../components/NextElectionCard';
import CommitteesCard from '../components/CommitteesCard';
import KeyDatesCard from '../components/KeyDatesCard';
import LockedPanels from '../components/LockedPanels';

const PANELS = member => [
  { title: 'Fundraising', desc: 'Receipts, disbursements and top contributor categories from FEC filings.' },
  { title: 'Stock trades', desc: 'Periodic transaction reports filed under the STOCK Act.' },
  { title: 'Public statements', desc: 'Press releases, floor remarks and newsletter archives.' },
  { title: member.chamber === 'Senate' ? 'State map' : 'District map',
    desc: member.chamber === 'Senate'
      ? `Statewide map, county results and ${member.state} demographics.`
      : `${member.seatShort} boundaries, county splits and district demographics.` }
];

/* Route: /members/:bioguideId */
export default function MemberDashboard({ member, weeks, feedGroups, totalLabel }) {
  return (
    <div className="min-h-screen bg-canvas flex justify-center">
      <div className="w-full max-w-[1280px] bg-sheet border-x border-rule">
        <SiteHeader active="Members" />

        <section className="px-7 pt-5 pb-7 border-b border-rule flex flex-col gap-[18px]">
          <Breadcrumb name={member.name} />
          <MemberHeader member={member} />
          <StatStrip stats={member.stats} />
          <TermProgress term={member.term} />
        </section>

        <main className="px-7 py-7 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-7 items-start">
          <div className="flex flex-col gap-7 min-w-0">
            <ActivityTimeline weeks={weeks} />
            <ActivityFeed groups={feedGroups} totals={member.eventTotals} totalLabel={totalLabel} />
          </div>
          <div className="flex flex-col gap-5 min-w-0">
            <NextElectionCard election={member.election} />
            <CommitteesCard committees={member.committees} />
            <KeyDatesCard dates={member.keyDates} />
          </div>
        </main>

        <LockedPanels panels={PANELS(member)} />
        <SiteFooter />
      </div>
    </div>
  );
}
