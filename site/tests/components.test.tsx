import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActivityFeed } from '@/components/ActivityFeed';
import { MemberDashboard } from '@/components/MemberDashboard';
import { MembersIndex } from '@/components/MembersIndex';
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
} from '@/lib/model';
import { KeyDatesCard } from '@/components/SideCards';
import {
  COTTON,
  COTTON_FUNDRAISING,
  COTTON_LIST,
  FEED,
  NO_CANDIDATE_FUNDRAISING,
  NO_COMMITTEE_FUNDRAISING,
  NO_FILINGS_FUNDRAISING,
  SANDERS,
  SANDERS_LIST,
  SLOTKIN,
  SLOTKIN_LIST,
  STEIL,
  STEIL_COMMITTEES,
  STEIL_FUNDRAISING,
  STEIL_KEY_DATES,
  STEIL_LIST,
  WEEKS,
} from './fixtures';

const TODAY = new Date(Date.UTC(2026, 8, 13));

function dashboard(detail = STEIL, fundraising = STEIL_FUNDRAISING) {
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
      fundraising={buildFundraising(fundraising, detail.seat.chamber)}
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
    expect(screen.getByText('2 full committee chairs')).toBeInTheDocument(); // member_summary.chairmanships
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
    const card = screen.getByText('Committees', { selector: 'h2' }).closest('section')!;
    expect(within(card).getAllByText('Chair')).toHaveLength(2); // agrees with the stat note
    expect(within(card).getByText('Subcommittee chair')).toBeInTheDocument();
    expect(screen.getByText('Wisconsin partisan primary')).toBeInTheDocument();
    for (const title of ['Stock trades', 'Public statements', 'District map']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getAllByText('Coming in a future release')).toHaveLength(3); // Fundraising is live
    expect(screen.getByText('3 not yet published')).toBeInTheDocument();
  });

  it('Senate member: Class 2 seat, three-Congress term line, state map panel', () => {
    render(dashboard(COTTON));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sen. Tom Cotton');
    expect(screen.getByText('Arkansas · Class 2')).toBeInTheDocument();
    expect(screen.getByText('Tracking 119th Congress')).toBeInTheDocument();
    expect(screen.getByText('Term: Jan 3, 2021 – Jan 3, 2027 · 890 roll calls in the 119th')).toBeInTheDocument();
    expect(screen.getByText('Age 49 · Serving since 2013 · 3rd term · 2nd in the Senate')).toBeInTheDocument();
    expect(screen.getByText('Senate Republican Conference Chair')).toBeInTheDocument(); // leadership_role
    expect(screen.getByText('State map')).toBeInTheDocument();
  });

  it('header: age and service line from bio and term_history; no chip without a leadership role', () => {
    render(dashboard());
    expect(screen.getByText('Age 45 · Serving since 2019 · 4th term')).toBeInTheDocument();
    expect(screen.queryByText(/Caucuses with/)).not.toBeInTheDocument();
  });

  it('Independent: INDEPENDENT badge, caucus note, unity note names the caucus, 12th term line', () => {
    render(dashboard(SANDERS));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sen. Bernard Sanders');
    expect(screen.getAllByText('INDEPENDENT').length).toBeGreaterThan(0);
    expect(screen.getByText('Caucuses with Democrats')).toBeInTheDocument(); // term.caucus
    expect(screen.getByText('Senate Democratic Outreach Chair')).toBeInTheDocument();
    expect(screen.getByText('Age 85 · Serving since 1991 · 12th term · 4th in the Senate')).toBeInTheDocument();
    expect(screen.getByText('99.87%')).toBeInTheDocument(); // member_vote_stats.party_unity_cq_pct
    expect(screen.getByText('votes with Democratic caucus')).toBeInTheDocument();
    expect(screen.getByText('Vermont · Class 1')).toBeInTheDocument();
    // Class 1 seat, term to 2031: the 2026 general election is shown but the seat is not on the ballot
    const election = screen.getByText('Next election').closest('section')!;
    expect(within(election).getByText('Nov 3, 2026')).toBeInTheDocument();
    expect(within(election).queryByText('On the ballot')).not.toBeInTheDocument();
  });

  it('first-term senator with House service reads "1st in the Senate"', () => {
    render(dashboard(SLOTKIN));
    expect(screen.getByText('Age 50 · Serving since 2019 · 4th term · 1st in the Senate')).toBeInTheDocument();
    expect(screen.getAllByText('DEMOCRATIC').length).toBeGreaterThan(0);
  });

  it('source links open in a new tab', () => {
    render(dashboard());
    const links = screen.getAllByRole('link', { name: /source ↗/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });
});

describe('key dates card', () => {
  it('shows congress-wide rows when the state has none, and an empty state when nothing applies', () => {
    const congressOnly = STEIL_KEY_DATES.filter((d) => d.scope === 'congress');
    const { unmount } = render(<KeyDatesCard dates={buildKeyDates(congressOnly)} />);
    expect(screen.getByText('119th Congress convenes')).toBeInTheDocument();
    expect(screen.getByText('General election day')).toBeInTheDocument();
    expect(screen.queryByText('Wisconsin partisan primary')).not.toBeInTheDocument();
    unmount();
    render(<KeyDatesCard dates={[]} />);
    expect(screen.getByText('No dates recorded.')).toBeInTheDocument();
  });
});

describe('activity feed', () => {
  it('renders votes with and without a bill title, filters by type, searches, and empties gracefully', () => {
    render(<ActivityFeed groups={groupFeed(FEED)} totals={eventTotals(FEED)} totalLabel="7" />);
    // The headline is plain text again; the row's one destination is the Details button.
    expect(
      screen.getByText('on H.R. 4795: Protect Economic and Academic Freedom Act of 2026'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'H.R. 4795' })).not.toBeInTheDocument();
    expect(screen.getByText('on nomination PN12-1')).toBeInTheDocument();
    expect(screen.getByText('On the Nomination · Nomination Confirmed 52–45')).toBeInTheDocument();
    expect(screen.getByText('on roll call 353')).toBeInTheDocument();
    expect(screen.getByText('On the Nomination · Nomination Confirmed 52–45')).toHaveClass('line-clamp-2');
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

  it('gives every row exactly one destination, chosen by mart.member_feed.bill_label', () => {
    render(<ActivityFeed groups={groupFeed(FEED)} totals={eventTotals(FEED)} totalLabel="7" />);
    const rows = screen.getAllByText(/^(on |Introduced |Cosponsored |H\.Res\.)/);
    expect(rows.length).toBe(7);
    for (const row of rows) {
      const container = row.closest('div.flex.gap-\\[11px\\]') as HTMLElement;
      const links = within(container).getAllByRole('link');
      expect(links).toHaveLength(1); // never both a Details and a source link
    }

    // four fixture rows name a bill that has a page: three votes/bills plus the committee action
    const details = screen.getAllByRole('link', { name: 'Details →' });
    expect(details.map((a) => a.getAttribute('href')).sort()).toEqual([
      '/bills/119/hr/4735',
      '/bills/119/hr/4795',
      '/bills/119/hr/5269',
      '/bills/119/hres/150',
    ]);
    for (const link of details) {
      expect(link).not.toHaveAttribute('target'); // internal, same tab
    }

    // the three rows with no bill page keep the outward source link
    const sources = screen.getAllByRole('link', { name: /source ↗/ });
    expect(sources).toHaveLength(3);
    for (const link of sources) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('href')).toMatch(/clerk\.house\.gov|senate\.gov/);
    }
  });
});

describe('members index', () => {
  const rows = [buildIndexRow(STEIL_LIST, STEIL), buildIndexRow(COTTON_LIST, COTTON)];

  it('cards link to dashboards and show attendance, sponsored, unity', () => {
    render(<MembersIndex members={rows} congressLabel="119th Congress" />);
    expect(screen.getByText('Members of the 119th Congress')).toBeInTheDocument();
    const steil = screen.getByRole('link', { name: /Rep\. Bryan Steil/ });
    expect(steil).toHaveAttribute('href', '/members/S001213');
    expect(within(steil).getByRole('presentation', { hidden: true })).toHaveAttribute(
      'src',
      'https://www.congress.gov/img/member/s001213_200.jpg',
    ); // member.photo_url on the index card
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

  it('with Democrats and an Independent present, every party chip is enabled and filters', () => {
    const four = [...rows, buildIndexRow(SANDERS_LIST, SANDERS), buildIndexRow(SLOTKIN_LIST, SLOTKIN)];
    render(<MembersIndex members={four} congressLabel="119th Congress" />);
    expect(screen.getByRole('button', { name: /Republican/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Democratic/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Independent/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Democratic/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /Independent/ })).toHaveTextContent('1');
    const sanders = screen.getByRole('link', { name: /Sen\. Bernard Sanders/ });
    expect(within(sanders).getByText('INDEPENDENT')).toBeInTheDocument();
    expect(within(sanders).getByText('99.87%')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Sen\. Elissa Slotkin/ })).getByText('DEMOCRATIC')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Republican/ }));
    fireEvent.click(screen.getByRole('button', { name: /Democratic/ }));
    expect(screen.getByText('1 of 4 members')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sen\. Bernard Sanders/ })).toBeInTheDocument();
  });
});

describe('fundraising card: given a mart.member_fundraising row, this text renders', () => {
  const card = () => screen.getByRole('region', { name: 'Fundraising' });

  it('three figures, the receipt-share bars with amounts, coverage, committee, and the FEC source link', () => {
    render(dashboard());
    const c = card();
    expect(within(c).getByText('2025–26 cycle')).toBeInTheDocument();
    expect(within(c).getByText('$5,467,777')).toBeInTheDocument(); // raised
    expect(within(c).getByText('$1,359,849')).toBeInTheDocument(); // spent
    expect(within(c).getByText('$6,327,099')).toBeInTheDocument(); // cash_on_hand
    expect(within(c).getByText('no debts')).toBeInTheDocument(); // debts = 0
    // small_donor_pct appears once, as the first breakdown row, never as a second headline stat
    expect(within(c).getAllByText('4.6%')).toHaveLength(1);
    expect(within(c).queryByText('Small-donor share')).not.toBeInTheDocument();
    expect(within(c).getByText('Small donors: individuals, $200 and under')).toBeInTheDocument();
    expect(within(c).getByText('$253,363')).toBeInTheDocument(); // the amount sits beside the share
    expect(within(c).getByText('40.1%')).toBeInTheDocument(); // transfers_pct
    expect(within(c).getByText('29.9%')).toBeInTheDocument(); // pac_pct
    expect(within(c).getByText('$1,000')).toBeInTheDocument(); // party: $1,000 beside "0.0%"
    expect(within(c).queryByText('Self-funding')).not.toBeInTheDocument(); // amount 0 is left out
    expect(within(c).getByText(/Money moved in from a joint fundraising committee/)).toBeInTheDocument();
    expect(within(c).getByText('Through Jul 22, 2026 · Pre-Primary report')).toBeInTheDocument();
    expect(within(c).getByText('Steil for Wisconsin, Inc. · principal campaign committee')).toBeInTheDocument();
    expect(within(c).getByRole('link', { name: /source/ })).toHaveAttribute(
      'href',
      'https://www.fec.gov/data/committee/C00677286/?cycle=2026',
    );
    const bars = c.querySelectorAll('div[style]');
    expect(Array.from(bars).map((b) => (b as HTMLElement).style.width)).toEqual([
      '4.63%',
      '22.68%',
      '29.88%',
      '0.02%',
      '40.07%',
      '2.72%',
    ]);
  });

  it('Senate committee with debts shows the debt note and its own committee', () => {
    render(dashboard(COTTON, COTTON_FUNDRAISING));
    const c = card();
    expect(within(c).getByText('$9,931,885')).toBeInTheDocument();
    expect(within(c).getByText('$73,959 in debts')).toBeInTheDocument();
    expect(within(c).getByText('Cotton for Senate, Inc. · principal campaign committee')).toBeInTheDocument();
    expect(within(c).getByText('Through Jun 30, 2026 · July Quarterly report')).toBeInTheDocument();
  });

  it('says what is missing instead of showing zeros', () => {
    const { unmount } = render(dashboard(STEIL, NO_FILINGS_FUNDRAISING));
    expect(within(card()).getByText(/Steil for Wisconsin, Inc\. has not filed a report covering the 2025–26 cycle yet/)).toBeInTheDocument();
    expect(within(card()).queryByText('$0')).not.toBeInTheDocument();
    expect(within(card()).getByRole('link', { name: /source/ })).toHaveAttribute('href', 'https://www.fec.gov/data/committee/C00677286/?cycle=2026');
    unmount();

    const second = render(dashboard(STEIL, NO_COMMITTEE_FUNDRAISING));
    expect(within(card()).getByText(/No principal campaign committee is registered with the FEC for the 2025–26 cycle/)).toBeInTheDocument();
    expect(within(card()).getByRole('link', { name: /source/ })).toHaveAttribute('href', 'https://www.fec.gov/data/candidate/H8WI01156/?cycle=2026&election_full=false');
    second.unmount();

    render(dashboard(STEIL, NO_CANDIDATE_FUNDRAISING));
    expect(within(card()).getByText(/The FEC has no House candidate record for this member/)).toBeInTheDocument();
    expect(within(card()).queryByRole('link', { name: /source/ })).not.toBeInTheDocument();
  });
});
