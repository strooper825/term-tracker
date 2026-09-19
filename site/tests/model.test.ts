import { describe, expect, it } from 'vitest';
import {
  buildCommitteeRows,
  buildElection,
  buildFundraising,
  buildHeader,
  buildIndexRow,
  buildKeyDates,
  buildRecord,
  buildStats,
  buildDateRanges,
  policyAreaTotals,
  rowsWithoutPolicyArea,
  ALL_DATES,
  buildVoteRows,
  serviceFacts,
  buildTerm,
  caucusParty,
  feedRow,
  seatLong,
} from '@/lib/model';
import {
  cycleLabel,
  formatDate,
  formatLongDate,
  formatMoney,
  formatShare,
  ordinal,
  titleCase,
} from '@/lib/format';
import {
  COTTON,
  COTTON_LIST,
  EN_BLOC,
  FEED,
  NO_CANDIDATE_FUNDRAISING,
  NO_COMMITTEE_FUNDRAISING,
  NO_FILINGS_FUNDRAISING,
  SANDERS,
  SANDERS_LIST,
  SESSIONS,
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

describe('header: given a mart row, these labels render', () => {
  it('House seat WI-1 becomes Wisconsin’s 1st District and a Rep. name', () => {
    const h = buildHeader(STEIL);
    expect(h.name).toBe('Rep. Bryan Steil');
    expect(h.seat).toBe('Wisconsin’s 1st District');
    expect(h.seatShort).toBe('WI-1');
    expect(h.chamberLabel).toBe('U.S. House of Representatives');
    expect(h.congress).toBe('119th Congress');
    expect(h.facts.slice(0, 2)).toEqual([
      { label: 'Current term', value: 'Jan 3, 2025 – Jan 3, 2027' },
      { label: 'Roll calls', value: '657', note: 'to date' },
    ]);
  });

  it('Senate seat Arkansas (Class 2) with a six-year term spanning three Congresses', () => {
    const h = buildHeader(COTTON);
    expect(h.name).toBe('Sen. Tom Cotton');
    expect(h.seat).toBe('Arkansas · Class 2');
    expect(h.seatShort).toBe('Arkansas (Class 2)');
    expect(h.congress).toBe('Tracking 119th Congress');
    expect(h.facts.slice(0, 2)).toEqual([
      { label: 'Current term', value: 'Jan 3, 2021 – Jan 3, 2027' },
      { label: 'Roll calls', value: '890', note: 'in the 119th' },
    ]);
  });

  it('at-large districts and party spellings', () => {
    expect(seatLong({ ...STEIL.seat, state_name: 'Alaska', district: 0 })).toBe('Alaska At Large');
    expect(buildHeader({ ...STEIL, party: 'Democrat' }).party).toBe('Democratic');
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(112)).toBe('112th');
  });

  it('service facts: age from bio.birthday, serving since and Nth term from term_history', () => {
    expect(serviceFacts(STEIL)).toEqual([
      { label: 'Age', value: '45' },
      { label: 'Serving since', value: '2019' },
      { label: 'Term', value: '4th' },
    ]);
    // House then Senate: the chamber count is added so a first-term senator reads correctly
    expect(serviceFacts(COTTON).at(-1)).toEqual({ label: 'Term', value: '3rd', note: '2nd in the Senate' });
    expect(serviceFacts(SLOTKIN).at(-1)).toEqual({ label: 'Term', value: '4th', note: '1st in the Senate' });
    expect(serviceFacts(SANDERS).at(-1)).toEqual({ label: 'Term', value: '12th', note: '4th in the Senate' });
    expect(serviceFacts({ ...STEIL, bio: { ...STEIL.bio, age: null } }).map((f) => f.label)).toEqual([
      'Serving since',
      'Term',
    ]);
  });

  it('leadership title and caucus note come from leadership_role and term.caucus', () => {
    expect(buildHeader(STEIL)).toMatchObject({ leadershipTitle: null, caucusNote: null });
    expect(buildHeader(COTTON).leadershipTitle).toBe('Senate Republican Conference Chair');
    const sanders = buildHeader(SANDERS);
    expect(sanders.party).toBe('Independent');
    expect(sanders.caucusNote).toBe('Caucuses with Democrats');
    expect(sanders.leadershipTitle).toBe('Senate Democratic Outreach Chair'); // the current role, not the ended one
    expect(buildHeader({ ...STEIL, party: 'Independent', caucus: 'Republican' }).caucusNote).toBe('Caucuses with Republicans');
    expect(caucusParty({ party: 'Democrat', caucus: 'Democrat' })).toBeNull();
  });
});

describe('stats and term', () => {
  it('five stats from member_vote_stats, bill_sponsorship counts, and committee assignments', () => {
    const stats = buildStats(STEIL);
    expect(stats.map((s) => [s.label, s.value, s.note])).toEqual([
      ['Attendance', '99.24%', '652 of 657 roll calls'],
      ['Party unity', '98.70%', 'votes with party majority'],
      ['Bills sponsored', '36', '119th Congress'],
      ['Bills cosponsored', '118', '119th Congress'],
      ['Committees', '6', '2 full committee chairs'],
    ]);
  });

  it('an Independent is scored against the caucus and the note says so (ADR 0005)', () => {
    const unity = buildStats(SANDERS).find((s) => s.label === 'Party unity');
    expect(unity).toEqual({ label: 'Party unity', value: '99.87%', note: 'votes with Democratic caucus' });
    expect(buildStats(SLOTKIN).find((s) => s.label === 'Party unity')?.note).toBe('votes with party majority');
    expect(buildStats(SANDERS).find((s) => s.label === 'Committees')?.note).toBe('no full committee chairs');
  });

  it('term progress uses days_elapsed over the term length', () => {
    expect(buildTerm(STEIL)).toEqual({ start: 'Jan 3, 2025', end: 'Jan 3, 2027', elapsed: 618, total: 730 });
    expect(buildTerm(COTTON)).toEqual({ start: 'Jan 3, 2021', end: 'Jan 3, 2027', elapsed: 2079, total: 2191 });
  });

  it('record card: vote and bill figures, and one row per term served', () => {
    const record = buildRecord(COTTON);
    expect(record.stats.find((r) => r.label === 'Votes cast')).toEqual({
      label: 'Votes cast',
      value: '876',
      note: 'of 890 roll calls in the 119th',
    });
    expect(record.stats.find((r) => r.label === 'Not voting')?.value).toBe('14');
    expect(record.stats.find((r) => r.label === 'Missed votes')?.value).toBe('1.57%');
    expect(record.stats.at(-1)?.value).toBe('99.77%'); // party_unity_pct, the plan definition
    expect(record.history.map((r) => r.value)).toEqual([
      'House · 2013–2015',
      'Senate · 2015–2021',
      'Senate · 2021–2027',
    ]);
  });
});

describe('committees', () => {
  it('maps titles to roles, prefixes subcommittees, and lists chairs first', () => {
    const rows = buildCommitteeRows(STEIL_COMMITTEES);
    expect(rows.slice(0, 3).map((r) => r.role)).toEqual(['Chair', 'Chair', 'Subcommittee chair']);
    expect(rows.filter((r) => r.role === 'Chair')).toHaveLength(2); // matches chairmanships = 2
    expect(rows.find((r) => r.name === 'Subcommittee on Capital Markets')?.role).toBe('Member');
    expect(rows.find((r) => r.name === 'Joint Committee on Printing')?.role).toBe('Vice Chair');
  });
});

describe('feed', () => {
  it('splits the vote position into the bold lead and keeps nomination and procedural votes readable', () => {
    const rows = FEED.map(feedRow);
    expect(rows[0]).toMatchObject({
      type: 'vote',
      lead: 'Voted YEA ',
      headline: 'on H.R. 4795: Protect Economic and Academic Freedom Act of 2026',
      secondary: 'On Passage · Passed 237–169',
      source: 'https://www.congress.gov/bill/119th-congress/house-bill/4795',
    });
    expect(rows[1]).toMatchObject({ lead: 'Voted YEA ', headline: 'on nomination PN12-1' });
    expect(rows[1].source).toContain('senate.gov');
    expect(rows[2]).toMatchObject({ lead: 'Did not vote ', headline: 'on roll call 353' });
    expect(rows[3]).toMatchObject({ lead: 'Voted Johnson (LA) ', headline: 'on roll call 2' });
    expect(rows[4]).toMatchObject({ type: 'sponsor', headline: 'Introduced H.R. 4735: Business of Insurance Regulatory Reform Act of 2025' });
    expect(rows[4].lead).toBeUndefined();
    expect(rows[6]).toMatchObject({ type: 'committee', headline: 'H.Res. 150: Submitted in House' });
    expect(rows[0].secondaryFull).toBeUndefined();
  });

  it('en bloc nomination votes show a count and keep the full list for hover', () => {
    const row = feedRow(EN_BLOC);
    expect(row.headline).toBe('on 48 nominations (en bloc)');
    expect(row.secondary).toBe('On the Cloture Motion · 48 nominations · Cloture Motion Rejected 51–48');
    expect(row.secondaryFull).toContain('PN25-28 and PN12-19');
  });

  it('long date labels carry the weekday', () => {
    expect(formatLongDate('2026-09-10')).toBe('Thursday, Sep 10, 2026');
  });
});

describe('key dates, election, index', () => {
  it('election card picks the next election-kind key date and says the seat is on the ballot', () => {
    const e = buildElection(STEIL_KEY_DATES, STEIL, TODAY);
    expect(e).toEqual({
      date: 'Nov 3, 2026',
      daysAway: 51,
      kind: 'General election day',
      onBallot: true,
      opponent: null,
      rating: null,
    });
    expect(buildElection([], STEIL, TODAY)).toBeNull();
    expect(formatDate('2026-11-03')).toBe('Nov 3, 2026');
  });

  it('index rows carry attendance, sponsored, and unity from the detail row', () => {
    expect(buildIndexRow(STEIL_LIST, STEIL)).toMatchObject({
      name: 'Rep. Bryan Steil',
      seatShort: 'WI-1',
      chamber: 'House',
      state: 'Wisconsin',
      attendance: 99.24,
      sponsored: 36,
      unity: 98.7,
      photoUrl: 'https://www.congress.gov/img/member/s001213_200.jpg',
    });
    expect(buildIndexRow(COTTON_LIST, COTTON)).toMatchObject({ name: 'Sen. Tom Cotton', chamber: 'Senate', state: 'Arkansas' });
    expect(buildIndexRow(SANDERS_LIST, SANDERS)).toMatchObject({ party: 'Independent', unity: 99.87, seatShort: 'Vermont (Class 1)' });
    expect(buildIndexRow(SLOTKIN_LIST, SLOTKIN)).toMatchObject({ party: 'Democratic', chamber: 'Senate', state: 'Michigan' });
  });

  it('key dates and election degrade when a state has no rows: congress-wide rows still apply', () => {
    const congressOnly = STEIL_KEY_DATES.filter((d) => d.scope === 'congress');
    expect(buildKeyDates(congressOnly).map((d) => d.label)).toEqual([
      '119th Congress convenes',
      'General election day',
      '119th Congress ends; House and Class 2 Senate terms expire at noon',
    ]);
    // a Class 1 senator whose term runs to 2031 is not on the 2026 ballot
    expect(buildElection(congressOnly, SANDERS, TODAY)).toMatchObject({ date: 'Nov 3, 2026', onBallot: false });
    expect(buildKeyDates([])).toEqual([]);
  });
});

describe('fundraising: every figure is a mart column, only formatted', () => {
  it('money, share, cycle and title-case formatters', () => {
    expect(formatMoney(5467777.07)).toBe('$5,467,777');
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(-12.6)).toBe('-$13');
    expect(formatShare(4.63)).toBe('4.6%');
    expect(formatShare(null)).toBe('n/a');
    expect(cycleLabel(2026)).toBe('2025–26 cycle');
    expect(titleCase('STEIL FOR WISCONSIN, INC.')).toBe('Steil for Wisconsin, Inc.');
    expect(titleCase('FRIENDS OF BERNIE SANDERS')).toBe('Friends of Bernie Sanders');
    expect(titleCase('PRE-PRIMARY')).toBe('Pre-Primary');
  });

  it('filed row: stats, share rows in source order (zero rows dropped), footer, source', () => {
    const m = buildFundraising(STEIL_FUNDRAISING, 'house');
    expect(m.filed).toBe(true);
    expect(m.stats.map((s) => [s.label, s.value, s.note])).toEqual([
      ['Raised', '$5,467,777', undefined],
      ['Spent', '$1,359,849', undefined],
      ['Cash on hand', '$6,327,099', 'no debts'],
    ]);
    expect(m.shares.map((r) => [r.label, r.pct, r.pctLabel, r.amount])).toEqual([
      ['Small donors: individuals, $200 and under', 4.63, '4.6%', '$253,363'],
      ['Individuals, over $200', 22.68, '22.7%', '$1,240,060'],
      ['PACs', 29.88, '29.9%', '$1,633,675'],
      ['Party committees', 0.02, '0.0%', '$1,000'],
      ['Transfers from authorized committees', 40.07, '40.1%', '$2,190,888'],
      ['Other receipts', 2.72, '2.7%', '$148,792'],
    ]);
    expect(m.shares.find((r) => r.label.startsWith('Transfers'))?.note).toMatch(/joint fundraising committee/);
    expect(m.shares.filter((r) => r.note).map((r) => r.label)).toEqual(['Transfers from authorized committees']);
    // a $15 source keeps its row and shows the dollar amount beside a 0.0% share
    const tiny = buildFundraising(
      { ...STEIL_FUNDRAISING, receipts: { ...STEIL_FUNDRAISING.receipts!, self_funding: { amount: 15, pct: 0 } } },
      'house',
    );
    expect(tiny.shares.find((r) => r.label === 'Self-funding')).toMatchObject({ amount: '$15', pctLabel: '0.0%', pct: 0 });
    expect(m.footer).toEqual([
      'Through Jul 22, 2026 · Pre-Primary report',
      'Steil for Wisconsin, Inc. · principal campaign committee',
    ]);
    expect(m.sourceUrl).toBe('https://www.fec.gov/data/committee/C00677286/?cycle=2026');
  });

  it('missing data: one message per status, nothing formatted as a zero', () => {
    const noFilings = buildFundraising(NO_FILINGS_FUNDRAISING, 'house');
    expect(noFilings.filed).toBe(false);
    expect(noFilings.stats).toEqual([]);
    expect(noFilings.message).toBe('Steil for Wisconsin, Inc. has not filed a report covering the 2025–26 cycle yet.');
    expect(noFilings.footer).toEqual(['Steil for Wisconsin, Inc.']);
    const noCommittee = buildFundraising(NO_COMMITTEE_FUNDRAISING, 'senate');
    expect(noCommittee.message).toBe('No principal campaign committee is registered with the FEC for the 2025–26 cycle.');
    expect(noCommittee.footer).toEqual(['FEC candidate H8WI01156']);
    expect(noCommittee.sourceUrl).toBe('https://www.fec.gov/data/candidate/H8WI01156/?cycle=2026&election_full=false');
    const noCandidate = buildFundraising(NO_CANDIDATE_FUNDRAISING, 'senate');
    expect(noCandidate.message).toBe('The FEC has no Senate candidate record for this member, so there are no filings to show.');
    expect(noCandidate.footer).toEqual([]);
    expect(noCandidate.sourceUrl).toBeNull();
  });
});

describe('feed rows and the vote list', () => {
  it('policy areas are counted from the rows and sorted commonest first, then by name', () => {
    // four of the seven fixture rows carry mart.member_feed.policy_area
    expect(policyAreaTotals(FEED)).toEqual([
      { name: 'Congress', count: 1 },
      { name: 'Education', count: 1 },
      { name: 'Finance and Financial Sector', count: 1 },
      { name: 'Government Operations and Politics', count: 1 },
    ]);
    expect(rowsWithoutPolicyArea(FEED)).toBe(3);

    // count wins over name, and ties fall back to the name so builds are stable
    const item = (policy_area: string | null) => ({ ...FEED[0], policy_area });
    expect(
      policyAreaTotals([item('Taxation'), item('Health'), item('Taxation'), item(null), item('Health'), item('Taxation')]),
    ).toEqual([
      { name: 'Taxation', count: 3 },
      { name: 'Health', count: 2 },
    ]);
  });

  it('date presets read their bounds from mart.congress_session and the term', () => {
    const ranges = buildDateRanges(SESSIONS, STEIL.term, new Date(Date.UTC(2026, 8, 13)));
    expect(ranges.map((r) => r.key)).toEqual([ALL_DATES, 'last30', 'last90', 'session', 'term']);

    const byKey = Object.fromEntries(ranges.map((r) => [r.key, r]));
    expect(byKey[ALL_DATES]).toEqual({ key: 'all', label: 'All dates', from: null, to: null });
    // the current session, not the first one
    expect(byKey.session).toEqual({
      key: 'session',
      label: 'This session (2026)',
      from: '2026-01-03',
      to: '2027-01-03',
    });
    expect(byKey.term).toEqual({
      key: 'term',
      label: 'Whole term',
      from: '2025-01-03',
      to: '2027-01-03',
    });
    // rolling windows count back from the anchor the caller passes, not from the wall clock
    expect(byKey.last30.from).toBe('2026-08-14');
    expect(byKey.last90.from).toBe('2026-06-15');
    expect(byKey.last30.to).toBeNull();
  });

  it('a member whose feed has no sessions yet still gets the other presets', () => {
    const ranges = buildDateRanges([], STEIL.term, new Date(Date.UTC(2026, 8, 13)));
    expect(ranges.map((r) => r.key)).toEqual([ALL_DATES, 'last30', 'last90', 'term']);
  });


  it('feed rows carry the policy area and the ISO date the filters compare', () => {
    const rows = FEED.map(feedRow);
    const vote = rows.find((r) => r.headline.includes('H.R. 4795'))!;
    expect(vote.policyArea).toBe('Education');
    expect(vote.isoDate).toBe('2026-09-03');
    const nomination = rows.find((r) => r.headline.includes('PN12-1'))!;
    expect(nomination.policyArea).toBeNull();
  });

  it('vote rows keep only roll calls, newest first, with the position and one destination', () => {
    const rows = buildVoteRows(FEED);
    expect(rows.map((r) => r.position)).toEqual(['Yea', 'Yea', 'Not Voting', 'Other']);
    expect(rows[0]).toMatchObject({
      date: 'Sep 3, 2026',
      policyArea: 'Education',
      detailsHref: '/bills/119/hr/4795',
    });
    expect(rows[0].lead).toBe('Voted YEA ');
    expect(rows[0].subject).toBe('on H.R. 4795: Protect Economic and Academic Freedom Act of 2026');
    expect(rows[1].detailsHref).toBeUndefined(); // a nomination has no bill page
    expect(rows[1].source).toMatch(/senate\.gov|clerk\.house\.gov/);
  });
});
