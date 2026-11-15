/** The /bills browse page (ADR 0025): the compact list it downloads, and the filtering, search
 *  and ordering it does in the browser. Pure functions, for the build, the page and tests. */
import type { BillIndexItem } from './types';

/** One bill as the browse files carry it: a short array, because there are about 27,000. */
export type BillRow = [
  type: string,
  number: string,
  label: string,
  title: string,
  topic: string,
  /** ISO date of the latest action, or '' */
  moved: string,
  action: string,
  sponsor: string,
  /** D, R, or another letter */
  party: string,
  state: string,
  cosponsors: number,
  stage: number,
  /** 1 had a floor vote, 2 minor (hidden by default), 4 has a page on the site */
  flags: number,
];

export const VOTE = 1;
export const MINOR = 2;
export const PAGE = 4;

export const STAGES = ['', 'Introduced', 'Out of committee', 'Passed one chamber', 'Passed both chambers', 'Became law'];
const STAGE_SLUG = ['', 'introduced', 'committee', 'passed-one', 'passed-both', 'law'];

export function toRow(b: BillIndexItem): BillRow {
  return [
    b.bill_type,
    b.bill_number,
    b.label,
    b.title,
    b.policy_area ?? '',
    b.latest_action_date ?? b.introduced_date ?? '',
    b.latest_action_text ?? '',
    b.sponsor_name ?? '',
    b.sponsor_party ?? '',
    b.sponsor_state ?? '',
    b.cosponsor_count,
    b.stage,
    (b.has_floor_vote ? VOTE : 0) | (b.is_minor ? MINOR : 0) | (b.has_page ? PAGE : 0),
  ];
}

/** A bill as the page shows and filters it. */
export interface Bill {
  key: string;
  type: string;
  number: string;
  label: string;
  title: string;
  topic: string;
  moved: string;
  action: string;
  sponsor: string;
  party: string;
  state: string;
  cosponsors: number;
  stage: number;
  vote: boolean;
  minor: boolean;
  chamber: 'house' | 'senate';
  /** The site's own page when it has one, else the bill on Congress.gov. */
  href: string;
  external: boolean;
  /** Lower-cased words a search is matched against. */
  haystack: string;
}

const SLUG: Record<string, string> = {
  hr: 'house-bill', s: 'senate-bill', hres: 'house-resolution', sres: 'senate-resolution',
  hjres: 'house-joint-resolution', sjres: 'senate-joint-resolution',
  hconres: 'house-concurrent-resolution', sconres: 'senate-concurrent-resolution',
  hamdt: 'house-amendment', samdt: 'senate-amendment', suamdt: 'senate-amendment',
};
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** The same address mart.bill_index builds (dbt macro congress_gov_url). */
export function congressGovUrl(congress: number, type: string, number: string): string {
  const kind = type.endsWith('amdt') ? 'amendment' : 'bill';
  return `https://www.congress.gov/${kind}/${ordinal(congress)}-congress/${SLUG[type] ?? type}/${number}`;
}

const compact = (text: string) => text.toLowerCase().replace(/[.\s]/g, '');

export function toBill(row: BillRow, congress: number): Bill {
  const [type, number, label, title, topic, moved, action, sponsor, party, state, cosponsors, stage, flags] = row;
  const page = Boolean(flags & PAGE);
  return {
    key: `${type}-${number}`,
    type, number, label, title, topic, moved, action, sponsor, party, state, cosponsors, stage,
    vote: Boolean(flags & VOTE),
    minor: Boolean(flags & MINOR),
    chamber: type.startsWith('h') ? 'house' : 'senate',
    href: page ? `/bills/${congress}/${type}/${number}` : congressGovUrl(congress, type, number),
    external: !page,
    // "H.R. 1234", "hr1234" and "hr 1234" all find it
    haystack: `${label} ${compact(label)} ${type} ${number} ${title} ${sponsor}`.toLowerCase(),
  };
}

export type When = 'week' | 'last-week' | 'month' | 'all';
export type Sort = 'important' | 'latest' | 'cosponsors';

export interface Filters {
  when: When;
  stages: number[];
  topic: string;
  chamber: '' | 'house' | 'senate';
  party: '' | 'D' | 'R';
  vote: boolean;
  /** Include amendments, simple and concurrent resolutions and post office namings. */
  everything: boolean;
  q: string;
  sort: Sort;
}

export const DEFAULTS: Filters = {
  when: 'week', stages: [], topic: '', chamber: '', party: '', vote: false, everything: false, q: '', sort: 'important',
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (today: Date, n: number) => iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n));

/** The first and last day a time filter covers: this week is today and the six days before. */
export function windowOf(when: When, today: Date): [string, string] {
  if (when === 'week') return [daysAgo(today, 6), iso(today)];
  if (when === 'last-week') return [daysAgo(today, 13), daysAgo(today, 7)];
  if (when === 'month') return [daysAgo(today, 29), iso(today)];
  return ['', '9999-12-31'];
}

/** True when the short "recent" file is enough: a time filter inside the last month, no search. */
export const recentIsEnough = (f: Filters) => f.when !== 'all' && !f.q.trim();

/** Everything but the stage filter, so the stage buttons can show what each would give. */
export function matchExceptStage(bills: Bill[], f: Filters, today: Date): Bill[] {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const squeezed = compact(f.q);
  // a search looks across the whole Congress, whatever the time filter says
  const [from, to] = words.length ? ['', '9999-12-31'] : windowOf(f.when, today);
  return bills.filter(
    (b) =>
      (f.everything || !b.minor || (words.length > 0 && compact(b.label) === squeezed)) &&
      b.moved >= from &&
      b.moved <= to &&
      (!f.topic || b.topic === f.topic) &&
      (!f.chamber || b.chamber === f.chamber) &&
      (!f.party || b.party === f.party) &&
      (!f.vote || b.vote) &&
      (words.every((w) => b.haystack.includes(w)) || (squeezed.length > 1 && b.haystack.includes(squeezed))),
  );
}

/** Most important first: how far it got, then a floor vote, then the latest to move. */
const importance = (b: Bill) => b.stage * 2 + (b.vote ? 1 : 0);

export function select(bills: Bill[], f: Filters, today: Date): Bill[] {
  const matched = matchExceptStage(bills, f, today).filter((b) => !f.stages.length || f.stages.includes(b.stage));
  const latest = (a: Bill, b: Bill) => b.moved.localeCompare(a.moved) || a.key.localeCompare(b.key);
  const squeezed = compact(f.q);
  return matched.sort((a, b) => {
    // typing a bill's number puts that bill first
    const exact = Number(compact(b.label) === squeezed) - Number(compact(a.label) === squeezed);
    if (exact) return exact;
    if (f.sort === 'important') return importance(b) - importance(a) || latest(a, b);
    if (f.sort === 'cosponsors') return b.cosponsors - a.cosponsors || latest(a, b);
    return latest(a, b);
  });
}

// ---- the page address, so a filtered view can be linked from an article ----

export function toQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.when !== DEFAULTS.when) p.set('moved', f.when);
  if (f.stages.length) p.set('stage', [...f.stages].sort().map((n) => STAGE_SLUG[n]).join(','));
  if (f.topic) p.set('topic', f.topic);
  if (f.chamber) p.set('chamber', f.chamber);
  if (f.party) p.set('party', f.party === 'D' ? 'democratic' : 'republican');
  if (f.vote) p.set('vote', 'yes');
  if (f.everything) p.set('all', 'yes');
  if (f.sort !== DEFAULTS.sort) p.set('sort', f.sort);
  const text = p.toString();
  return text ? `?${text}` : '';
}

export function fromQuery(search: string): Filters {
  const p = new URLSearchParams(search);
  const one = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  return {
    q: p.get('q') ?? '',
    when: one(p.get('moved'), ['week', 'last-week', 'month', 'all'] as const, DEFAULTS.when),
    stages: (p.get('stage') ?? '').split(',').map((s) => STAGE_SLUG.indexOf(s)).filter((n) => n > 0),
    topic: p.get('topic') ?? '',
    chamber: one(p.get('chamber'), ['', 'house', 'senate'] as const, ''),
    party: p.get('party') === 'democratic' ? 'D' : p.get('party') === 'republican' ? 'R' : '',
    vote: p.get('vote') === 'yes',
    everything: p.get('all') === 'yes',
    sort: one(p.get('sort'), ['important', 'latest', 'cosponsors'] as const, DEFAULTS.sort),
  };
}

/** "today", "yesterday", "3 days ago", then the date itself. */
export function movedWords(moved: string, today: Date): string {
  if (!moved) return '';
  const [y, m, d] = moved.split('-').map(Number);
  const days = Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(y, m - 1, d)) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days > 1 && days < 31) return `${days} days ago`;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
