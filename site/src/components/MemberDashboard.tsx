// Ported from design/src/pages/MemberDashboard.jsx, then reorganised into tabs. Server
// component: every prop is built at build time in src/lib/model.ts from API rows. The header
// (identity, facts, stats, term progress) stays in view; everything below it is a tab, and each
// tab is one function here, so a section can grow without touching the others.
import type {
  CommitteeRow,
  ContactModel,
  DateRange,
  ElectionModel,
  FundraisingModel,
  KeyDateRow,
  MemberHeaderModel,
  PolicyAreaCount,
  RecordModel,
  Stat,
  StatementsModel,
  TermModel,
  VoteRow,
} from '@/lib/model';
import { ContactTab } from './ContactCards';
import { FundraisingCard } from './FundraisingCard';
import { MemberFacts, MemberHeader, StatStrip, TermProgress } from './MemberHeader';
import { MemberTabs, type TabSpec } from './MemberTabs';
import { RollCallVotes } from './RollCallVotes';
import { CommitteesCard, KeyDatesCard, LockedTabPanel, NextElectionCard } from './SideCards';
import { Breadcrumb, SiteFooter, SiteHeader } from './SiteChrome';
import { StatementsTab } from './StatementsTab';
import { RecordCard } from './TermCards';

export interface DashboardProps {
  member: MemberHeaderModel;
  stats: Stat[];
  term: TermModel;
  votes: VoteRow[];
  /** "119th Congress": the Congress the vote list covers. */
  congressLabel: string;
  policyAreas: PolicyAreaCount[];
  dateRanges: DateRange[];
  record: RecordModel;
  election: ElectionModel | null;
  committees: CommitteeRow[];
  /** Null when the source has no contact information: the tab is then not yet published. */
  contact: ContactModel | null;
  /** Null when the member is not in the statement sources seed: the tab is then not yet published. */
  statements: StatementsModel | null;
  keyDates: KeyDateRow[];
  fundraising: FundraisingModel;
  lastUpdated: string | null;
}

/* Congress activity: what the member does in the chamber. Votes take the wide column; their
   committees and record sit beside it. */
function CongressActivityTab(props: DashboardProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-main gap-7 items-start">
      <div className="min-w-0">
        <RollCallVotes
          votes={props.votes}
          congressLabel={props.congressLabel}
          policyAreas={props.policyAreas}
          dateRanges={props.dateRanges}
        />
      </div>
      <div className="flex flex-col gap-5 min-w-0">
        <CommitteesCard committees={props.committees} />
        <RecordCard record={props.record} />
      </div>
    </div>
  );
}

/* Election: fundraising takes the wide column at full size; the next election and the calendar
   sit beside it. */
function ElectionTab(props: DashboardProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-main gap-7 items-start">
      <div className="min-w-0">
        <FundraisingCard model={props.fundraising} />
      </div>
      <div className="flex flex-col gap-5 min-w-0">
        <NextElectionCard election={props.election} />
        <KeyDatesCard dates={props.keyDates} />
      </div>
    </div>
  );
}

export function memberTabs(props: DashboardProps): TabSpec[] {
  return [
    { id: 'activity', label: 'Congress activity', content: <CongressActivityTab {...props} /> },
    { id: 'election', label: 'Election', content: <ElectionTab {...props} /> },
    props.contact
      ? { id: 'contact', label: 'Contact', content: <ContactTab contact={props.contact} /> }
      : {
          id: 'contact',
          label: 'Contact',
          locked: true,
          content: (
            <LockedTabPanel
              title="Contact"
              desc="Office phone, address and contact form for this member."
            />
          ),
        },
    {
      id: 'stock-trades',
      label: 'Stock trades',
      locked: true,
      content: (
        <LockedTabPanel
          title="Stock trades"
          desc="Periodic transaction reports filed under the STOCK Act."
        />
      ),
    },
    props.statements
      ? {
          id: 'statements',
          label: 'Public statements',
          content: <StatementsTab model={props.statements} name={props.member.name} />,
        }
      : {
          id: 'statements',
          label: 'Public statements',
          locked: true,
          content: (
            <LockedTabPanel
              title="Public statements"
              desc="Press releases from this member's office."
            />
          ),
        },
    {
      id: 'constituency',
      label: 'Constituency',
      locked: true,
      content: <LockedTabPanel title="Constituency" desc="This section has not been published yet." />,
    },
  ];
}

export function MemberDashboard(props: DashboardProps) {
  const { member } = props;
  return (
    <div className="min-h-screen bg-canvas flex justify-center">
      <div className="w-full max-w-[1280px] bg-sheet border-x border-rule">
        <SiteHeader active="Members" />

        <section className="px-7 pt-5 pb-7 flex flex-col gap-[18px]">
          <Breadcrumb name={member.name} />
          <MemberHeader member={member} />
          <MemberFacts facts={member.facts} />
          <StatStrip stats={props.stats} />
          <TermProgress term={props.term} />
        </section>

        <MemberTabs tabs={memberTabs(props)} />

        <SiteFooter lastUpdated={props.lastUpdated} />
      </div>
    </div>
  );
}
