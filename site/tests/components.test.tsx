import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActivityFeed } from '@/components/ActivityFeed';
import { MemberDashboard } from '@/components/MemberDashboard';
import { MembersIndex } from '@/components/MembersIndex';
import {
  buildCommitteeRows,
  buildElection,
  buildHeader,
  buildIndexRow,
  buildKeyDates,
  buildStats,
  buildTerm,
  buildWeeks,
  eventTotals,
  groupFeed,
} from '@/lib/model';
import { COTTON, COTTON_LIST, FEED, STEIL, STEIL_COMMITTEES, STEIL_KEY_DATES, STEIL_LIST, WEEKS } from './fixtures';

const TODAY = new Date(Date.UTC(2026, 8, 13));

function dashboard(detail = STEIL) {
  return (
    <MemberDashboard
      member={buildHeader(detail)}
      stats={buildStats(detail)}
      term={buildTerm(detail)}
      weeks={buildWeeks(WEEKS, '2025-01-03', '2026-09-13')}
      feedGroups={groupFeed(FEED)}
      eventTotals={eventTotals(FEED)}
      totalLabel="7"
      election={buildElection(STEIL_KEY_DATES, detail, TODAY)}
      committees={buildCommitteeRows(STEIL_COMMITTEES)}
      keyDates={buildKeyDates(STEIL_KEY_DATES)}
      lastUpdated="Sep 13, 2026 02:09 UTC"
    />
  );
}

describe('member dashboard: given these mart rows, this text renders', () => {
  it('header, breadcrumb, five stats, term bar, and footer', () => {
    render(dashboard());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Rep. Bryan Steil');
    expect(screen.getByText('Wisconsin’s 1st District')).toBeInTheDocument();
    expect(screen.getAllByText('REPUBLICAN').length).toBeGreaterThan(0);
    expect(screen.getByText('99.24%')).toBeInTheDocument(); // member_vote_stats.attendance_pct
    expect(screen.getByText('652 of 657 roll calls')).toBeInTheDocument();
    expect(screen.getByText('98.70%')).toBeInTheDocument(); // member_vote_stats.party_unity_cq_pct
    const strip = screen.getByText('Bills sponsored').parentElement!.parentElement!; // stat grid
    expect(within(strip).getByText('36')).toBeInTheDocument(); // member_summary.bills_sponsored
    expect(within(strip).getByText('118')).toBeInTheDocument(); // member_summary.bills_cosponsored
    expect(screen.getByText('1 chairmanship')).toBeInTheDocument(); // member_summary.chairmanships
    expect(screen.getByText(/Term progress · 618 of 730 days elapsed/)).toBeInTheDocument();
    expect(screen.getByText('84.7%')).toBeInTheDocument();
    expect(screen.getByText(/Last updated Sep 13, 2026 02:09 UTC/)).toBeInTheDocument();
    expect(screen.getAllByRole('navigation')).toHaveLength(2); // site nav + breadcrumb
    expect(screen.getByText('Members', { selector: 'a.text-ink2' })).toHaveAttribute('href', '/members');
  });

  it('next election, committees, key dates, and locked panels', () => {
    render(dashboard());
    const election = screen.getByText('Next election').closest('section')!;
    expect(within(election).getByText('Nov 3, 2026')).toBeInTheDocument();
    expect(within(election).getByText(/General election day · 51 days away/)).toBeInTheDocument();
    expect(within(election).getByText('On the ballot')).toBeInTheDocument();
    expect(within(election).getAllByText('Not yet available')).toHaveLength(2); // opponent, rating
    const keyDates = screen.getByText('Key dates').closest('section')!;
    expect(within(keyDates).getByText('Nov 3, 2026')).toBeInTheDocument();
    expect(screen.getByText('House Committee on House Administration')).toBeInTheDocument();
    expect(screen.getByText('Subcommittee on Capital Markets')).toBeInTheDocument();
    expect(screen.getByText('Wisconsin partisan primary')).toBeInTheDocument();
    for (const title of ['Fundraising', 'Stock trades', 'Public statements', 'District map']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getAllByText('Coming in a future release')).toHaveLength(4);
  });

  it('Senate member: Class 2 seat, three-Congress term line, state map panel', () => {
    render(dashboard(COTTON));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sen. Tom Cotton');
    expect(screen.getByText('Arkansas · Class 2')).toBeInTheDocument();
    expect(screen.getByText('Tracking 119th Congress')).toBeInTheDocument();
    expect(screen.getByText('Term: Jan 3, 2021 – Jan 3, 2027 · 890 roll calls in the 119th')).toBeInTheDocument();
    expect(screen.getByText('State map')).toBeInTheDocument();
  });
});

describe('activity feed', () => {
  it('renders votes with and without a bill title, filters by type, searches, and empties gracefully', () => {
    render(<ActivityFeed groups={groupFeed(FEED)} totals={eventTotals(FEED)} totalLabel="7" />);
    expect(screen.getByText('on H.R. 4795: Protect Economic and Academic Freedom Act of 2026')).toBeInTheDocument();
    expect(screen.getByText('on nomination PN12-1')).toBeInTheDocument();
    expect(screen.getByText('On the Nomination · Nomination Confirmed 52–45')).toBeInTheDocument();
    expect(screen.getByText('on roll call 353')).toBeInTheDocument();
    expect(screen.getByText('Did not vote')).toBeInTheDocument();
    expect(screen.getByText('7 of 7 events')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Floor vote/ }));
    expect(screen.getByText('3 of 7 events')).toBeInTheDocument();
    expect(screen.queryByText('on nomination PN12-1')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search activity'), { target: { value: 'zzzz' } });
    expect(screen.getByText(/No events match “zzzz”/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('7 of 7 events')).toBeInTheDocument();
  });
});

describe('members index', () => {
  const rows = [buildIndexRow(STEIL_LIST, STEIL), buildIndexRow(COTTON_LIST, COTTON)];

  it('cards link to dashboards and show attendance, sponsored, unity', () => {
    render(<MembersIndex members={rows} congressLabel="119th Congress" />);
    expect(screen.getByText('Members of the 119th Congress')).toBeInTheDocument();
    const steil = screen.getByRole('link', { name: /Rep\. Bryan Steil/ });
    expect(steil).toHaveAttribute('href', '/members/S001213');
    expect(within(steil).getByText('99.24%')).toBeInTheDocument();
    expect(within(steil).getByText('36')).toBeInTheDocument();
    expect(within(steil).getByText('98.70%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sen\. Tom Cotton/ })).toHaveAttribute('href', '/members/C001095');
  });

  it('zero-count chips are disabled; chamber filter, search, and sort work; empty state clears', () => {
    render(<MembersIndex members={rows} congressLabel="119th Congress" />);
    expect(screen.getByRole('button', { name: /Democratic/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Independent/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^House/ }));
    expect(screen.getByText('1 of 2 members')).toBeInTheDocument();
    expect(screen.queryByText('Rep. Bryan Steil')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Attendance' } });
    const links = screen.getAllByRole('link', { name: /Rep\.|Sen\./ });
    expect(links[0]).toHaveTextContent('Rep. Bryan Steil'); // 99.24 sorts above 98.43

    fireEvent.change(screen.getByLabelText('Search members'), { target: { value: 'Nebraska' } });
    expect(screen.getByText(/No members match “Nebraska”/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('2 of 2 members')).toBeInTheDocument();
  });
});
