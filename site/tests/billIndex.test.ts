import { describe, expect, it } from 'vitest';
import {
  DEFAULTS,
  MINOR,
  PAGE,
  VOTE,
  congressGovUrl,
  fromQuery,
  matchExceptStage,
  movedWords,
  recentIsEnough,
  select,
  toBill,
  toQuery,
  toRow,
  windowOf,
  type BillRow,
  type Filters,
} from '@/lib/billIndex';
import type { BillIndexItem } from '@/lib/types';

const TODAY = new Date(2026, 10, 15); // 15 November 2026
const row = (type: string, number: string, over: Partial<{ title: string; topic: string; moved: string; sponsor: string; party: string; cosponsors: number; stage: number; flags: number }> = {}): BillRow => [
  type, number, `${type === 'hr' ? 'H.R.' : type === 's' ? 'S.' : type === 'hres' ? 'H.Res.' : 'S.Amdt.'} ${number}`,
  over.title ?? `Title ${number}`, over.topic ?? 'Health', over.moved ?? '2026-11-14', 'Latest action', over.sponsor ?? 'Pat Example',
  over.party ?? 'D', 'WI', over.cosponsors ?? 0, over.stage ?? 1, over.flags ?? 0,
];
const BILLS = [
  row('hr', '1', { stage: 5, flags: VOTE | PAGE, moved: '2026-11-10', cosponsors: 40 }),
  row('s', '2', { stage: 3, flags: VOTE, moved: '2026-11-15', party: 'R', topic: 'Taxation', cosponsors: 90 }),
  row('hr', '3', { stage: 3, moved: '2026-11-12', title: 'Rural Broadband Act', sponsor: 'Sam Rivers' }),
  row('hr', '4', { stage: 1, moved: '2026-11-05' }),
  row('s', '5', { stage: 4, moved: '2026-10-20', party: 'R' }),
  row('hr', '6', { stage: 2, moved: '2026-03-01', title: 'Old Health Act' }),
  row('hres', '7', { stage: 3, flags: MINOR, moved: '2026-11-14' }),
  row('samdt', '8', { flags: MINOR | VOTE, moved: '2026-11-13' }),
].map((r) => toBill(r, 119));
const pick = (over: Partial<Filters>) => select(BILLS, { ...DEFAULTS, ...over }, TODAY).map((b) => b.label);

describe('the browse list', () => {
  it('a row carries what the API gives, and links to our page or to Congress.gov', () => {
    const item: BillIndexItem = {
      congress: 119, bill_type: 'hr', bill_number: '10', label: 'H.R. 10', kind: 'bill', title: 'A bill', policy_area: null,
      origin_chamber: 'House', introduced_date: '2026-01-05', latest_action_date: null, latest_action_text: null,
      sponsor_name: 'Pat Example', sponsor_party: 'D', sponsor_state: 'WI', cosponsor_count: 3, cosponsors_democratic: 2,
      cosponsors_republican: 1, stage: 2, has_floor_vote: true, is_minor: false, has_page: false, congress_gov_url: '',
    };
    const bill = toBill(toRow(item), 119);
    expect(bill).toMatchObject({ label: 'H.R. 10', moved: '2026-01-05', vote: true, minor: false, chamber: 'house', external: true });
    expect(bill.href).toBe('https://www.congress.gov/bill/119th-congress/house-bill/10');
    expect(toBill(toRow({ ...item, has_page: true }), 119)).toMatchObject({ href: '/bills/119/hr/10', external: false });
    expect(congressGovUrl(119, 'samdt', '8')).toBe('https://www.congress.gov/amendment/119th-congress/senate-amendment/8');
    expect(congressGovUrl(121, 'sjres', '2')).toBe('https://www.congress.gov/bill/121st-congress/senate-joint-resolution/2');
  });

  it('this week is today and the six days before; last week is the seven before that', () => {
    expect(windowOf('week', TODAY)).toEqual(['2026-11-09', '2026-11-15']);
    expect(windowOf('last-week', TODAY)).toEqual(['2026-11-02', '2026-11-08']);
    expect(windowOf('month', TODAY)).toEqual(['2026-10-17', '2026-11-15']);
    expect(pick({ sort: 'latest' })).toEqual(['S. 2', 'H.R. 3', 'H.R. 1']);
    expect(pick({ when: 'last-week' })).toEqual(['H.R. 4']);
    expect(pick({ when: 'month', sort: 'latest' })).toEqual(['S. 2', 'H.R. 3', 'H.R. 1', 'H.R. 4', 'S. 5']);
  });

  it('most important is how far it got, then a floor vote, then the latest to move', () => {
    expect(pick({ when: 'all' })).toEqual(['H.R. 1', 'S. 5', 'S. 2', 'H.R. 3', 'H.R. 6', 'H.R. 4']);
    expect(pick({ when: 'all', sort: 'cosponsors' }).slice(0, 2)).toEqual(['S. 2', 'H.R. 1']);
  });

  it('amendments and ceremonial measures stay out until asked for', () => {
    expect(pick({})).not.toContain('H.Res. 7');
    expect(pick({ everything: true, sort: 'latest' })).toEqual(['S. 2', 'H.Res. 7', 'S.Amdt. 8', 'H.R. 3', 'H.R. 1']);
  });

  it('filters combine: stage, topic, chamber, party and a floor vote', () => {
    expect(pick({ when: 'all', stages: [3, 5] })).toEqual(['H.R. 1', 'S. 2', 'H.R. 3']);
    expect(pick({ when: 'all', topic: 'Taxation' })).toEqual(['S. 2']);
    expect(pick({ when: 'all', chamber: 'senate' })).toEqual(['S. 5', 'S. 2']);
    expect(pick({ when: 'all', party: 'R', vote: true })).toEqual(['S. 2']);
    // the stage buttons count what each would give under the other filters
    const base = matchExceptStage(BILLS, { ...DEFAULTS, when: 'all', stages: [5], chamber: 'house' }, TODAY);
    expect(base.filter((b) => b.stage === 3)).toHaveLength(1);
  });

  it('a search looks across the whole Congress, by title, number or sponsor', () => {
    expect(pick({ q: 'old health' })).toEqual(['H.R. 6']); // moved in March, outside this week
    expect(pick({ q: 'broadband' })).toEqual(['H.R. 3']);
    expect(pick({ q: 'rivers' })).toEqual(['H.R. 3']);
    expect(pick({ q: 'hr 6' })[0]).toBe('H.R. 6');
    expect(pick({ q: 'HR6' })[0]).toBe('H.R. 6');
    expect(pick({ q: 'h.r. 1' })[0]).toBe('H.R. 1');
    // a hidden measure is still found by its own number
    expect(pick({ q: 'hres 7' })).toEqual(['H.Res. 7']);
    expect(pick({ q: 'zzz' })).toEqual([]);
  });

  it('the short file is enough until a search or All needs everything', () => {
    expect(recentIsEnough(DEFAULTS)).toBe(true);
    expect(recentIsEnough({ ...DEFAULTS, when: 'month' })).toBe(true);
    expect(recentIsEnough({ ...DEFAULTS, when: 'all' })).toBe(false);
    expect(recentIsEnough({ ...DEFAULTS, q: 'tax' })).toBe(false);
  });

  it('every filter is in the address, and an address gives the filters back', () => {
    expect(toQuery(DEFAULTS)).toBe('');
    const f: Filters = { when: 'last-week', stages: [5, 4], topic: 'Armed Forces and National Security', chamber: 'house', party: 'R', vote: true, everything: true, q: 'hr 1', sort: 'cosponsors' };
    const query = toQuery(f);
    expect(query).toBe('?q=hr+1&moved=last-week&stage=passed-both%2Claw&topic=Armed+Forces+and+National+Security&chamber=house&party=republican&vote=yes&all=yes&sort=cosponsors');
    expect(fromQuery(query)).toEqual({ ...f, stages: [4, 5] });
    expect(fromQuery('?moved=someday&stage=nope&sort=x&chamber=moon')).toEqual(DEFAULTS);
  });

  it('says when a bill last moved in plain words', () => {
    expect(movedWords('2026-11-15', TODAY)).toBe('today');
    expect(movedWords('2026-11-14', TODAY)).toBe('yesterday');
    expect(movedWords('2026-11-10', TODAY)).toBe('5 days ago');
    expect(movedWords('2026-03-01', TODAY)).toBe('Mar 1, 2026');
  });
});
