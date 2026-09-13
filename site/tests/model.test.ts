import { describe, expect, it } from 'vitest';
import {
  MIN_TICK_GAP_WEEKS,
  buildCommitteeRows,
  buildElection,
  buildFundraising,
  buildHeader,
  buildIndexRow,
  buildKeyDates,
  buildStats,
  buildTerm,
  buildWeeks,
  caucusParty,
  eventTotals,
  feedRow,
  groupFeed,
  seatLong,
  serviceLine,
  timelineRange,
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
    expect(h.termLine).toBe('Term: Jan 3, 2025 – Jan 3, 2027 · 657 roll calls to date');
  });

  it('Senate seat Arkansas (Class 2) with a six-year term spanning three Congresses', () => {
    const h = buildHeader(COTTON);
    expect(h.name).toBe('Sen. Tom Cotton');
    expect(h.seat).toBe('Arkansas · Class 2');
    expect(h.seatShort).toBe('Arkansas (Class 2)');
    expect(h.congress).toBe('Tracking 119th Congress');
    expect(h.termLine).toBe('Term: Jan 3, 2021 – Jan 3, 2027 · 890 roll calls in the 119th');
  });

  it('at-large districts and party spellings', () => {
    expect(seatLong({ ...STEIL.seat, state_name: 'Alaska', district: 0 })).toBe('Alaska At Large');
    expect(buildHeader({ ...STEIL, party: 'Democrat' }).party).toBe('Democratic');
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(112)).toBe('112th');
  });

  it('service line: age from bio.birthday, serving since and Nth term from term_history', () => {
    expect(serviceLine(STEIL)).toBe('Age 45 · Serving since 2019 · 4th term');
    // House then Senate: the chamber count is added so a first-term senator reads correctly
    expect(serviceLine(COTTON)).toBe('Age 49 · Serving since 2013 · 3rd term · 2nd in the Senate');
    expect(serviceLine(SLOTKIN)).toBe('Age 50 · Serving since 2019 · 4th term · 1st in the Senate');
    expect(serviceLine(SANDERS)).toBe('Age 85 · Serving since 1991 · 12th term · 4th in the Senate');
    expect(serviceLine({ ...STEIL, bio: { ...STEIL.bio, age: null } })).toBe('Serving since 2019 · 4th term');
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

  it('timeline range starts at the tracked Congress, not the Senate term start', () => {
    expect(timelineRange(COTTON, TODAY)).toEqual({ from: '2025-01-03', to: '2026-09-13' });
    expect(timelineRange(STEIL, TODAY)).toEqual({ from: '2025-01-03', to: '2026-09-13' });
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

  it('groups by calendar day with a long date label and counts totals per type', () => {
    const groups = groupFeed(FEED);
    expect(groups[0].date).toBe('Thursday, Sep 3, 2026');
    expect(formatLongDate('2026-09-10')).toBe('Thursday, Sep 10, 2026');
    expect(eventTotals(FEED)).toEqual({ vote: 4, sponsor: 1, cosponsor: 1, committee: 1 });
  });
});

describe('weeks, key dates, election, index', () => {
  it('zero-fills every Monday between from and to and keeps the API counts', () => {
    const weeks = buildWeeks(WEEKS, '2025-01-03', '2026-09-13');
    expect(weeks[0].label).toBe('Dec 30, 2024');
    expect(weeks.length).toBe(89);
    const july = weeks.find((w) => w.label === 'Jul 21, 2025');
    expect(july?.counts).toEqual({ vote: 12, sponsor: 1, cosponsor: 3, committee: 0 });
    expect(weeks.every((w) => Object.values(w.counts).every((n) => n >= 0))).toBe(true);
    const tickIndices = weeks.map((w, i) => (w.tick ? i : -1)).filter((i) => i >= 0);
    expect(tickIndices.length).toBeGreaterThan(6);
    for (let i = 1; i < tickIndices.length; i += 1) {
      expect(tickIndices[i] - tickIndices[i - 1]).toBeGreaterThanOrEqual(MIN_TICK_GAP_WEEKS);
    }
    expect(weeks[0].tick).toBe('Jan 2025'); // the week of Dec 30 is mostly January
    expect(weeks.find((w) => w.tick === 'Jan 2026')).toBeTruthy();
    expect(weeks.find((w) => w.tick === 'Feb')).toBeUndefined(); // too close to the January label
  });

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
      ['Small-donor share', '4.6%', 'of total raised'],
    ]);
    expect(m.shares.map((r) => [r.label, r.pct, r.pctLabel, r.amount])).toEqual([
      ['Individuals, $200 and under', 4.63, '4.6%', '$253,363'],
      ['Individuals, over $200', 22.68, '22.7%', '$1,240,060'],
      ['PACs', 29.88, '29.9%', '$1,633,675'],
      ['Party committees', 0.02, '0.0%', '$1,000'],
      ['Transfers from authorized committees', 40.07, '40.1%', '$2,190,888'],
      ['Other receipts', 2.72, '2.7%', '$148,792'],
    ]);
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
