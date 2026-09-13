import { describe, expect, it } from 'vitest';
import {
  buildCommitteeRows,
  buildElection,
  buildHeader,
  buildIndexRow,
  buildStats,
  buildTerm,
  buildWeeks,
  eventTotals,
  feedRow,
  groupFeed,
  seatLong,
  timelineRange,
} from '@/lib/model';
import { formatDate, formatLongDate, ordinal } from '@/lib/format';
import { COTTON, COTTON_LIST, FEED, STEIL, STEIL_COMMITTEES, STEIL_KEY_DATES, STEIL_LIST, WEEKS } from './fixtures';

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
});

describe('stats and term', () => {
  it('five stats from member_vote_stats, bill_sponsorship counts, and committee assignments', () => {
    const stats = buildStats(STEIL, STEIL_COMMITTEES);
    expect(stats.map((s) => [s.label, s.value, s.note])).toEqual([
      ['Attendance', '99.24%', '652 of 657 roll calls'],
      ['Party unity', '98.61%', 'votes with party majority'],
      ['Bills sponsored', '36', '119th Congress'],
      ['Bills cosponsored', '118', '119th Congress'],
      ['Committees', '6', '3 chairmanships'],
    ]);
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
    expect(rows.slice(0, 3).map((r) => r.role)).toEqual(['Chair', 'Chair', 'Chair']);
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
    expect(weeks.filter((w) => w.tick).length).toBeGreaterThan(10);
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
      unity: 98.61,
    });
    expect(buildIndexRow(COTTON_LIST, COTTON)).toMatchObject({ name: 'Sen. Tom Cotton', chamber: 'Senate', state: 'Arkansas' });
  });
});
