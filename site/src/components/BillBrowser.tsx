'use client';

// The /bills browse page (ADR 0025): search and filter every bill of the Congress.
// It opens on what moved in the last week, from a short file; the whole Congress is fetched
// only when a search or the "All" filter needs it. Every filter is in the address, so a view
// can be linked from an article.
import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULTS,
  STAGES,
  fromQuery,
  matchExceptStage,
  movedWords,
  recentIsEnough,
  select,
  toBill,
  toQuery,
  type Bill,
  type BillRow,
  type Filters,
  type Sort,
  type When,
} from '@/lib/billIndex';

interface RecentFile {
  congress: number;
  total: number;
  topics: string[];
  rows: BillRow[];
}

const PAGE_SIZE = 50;
const WHEN: [When, string][] = [['week', 'This week'], ['last-week', 'Last week'], ['month', 'This month'], ['all', 'All']];
const SORTS: [Sort, string][] = [['important', 'Most important'], ['latest', 'Latest action'], ['cosponsors', 'Most cosponsors']];
const PARTY_WORD: Record<string, string> = { D: 'D', R: 'R', I: 'I' };

const option = (on: boolean) =>
  `min-h-[44px] px-3 rounded-ctl border-2 text-[14px] text-ink cursor-pointer ${on ? 'border-navy bg-lockBg font-semibold' : 'border-rule bg-card hover:border-ink3'}`;
const heading = 'm-0 text-label font-semibold uppercase text-ink2';

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as T;
}

export function BillBrowser() {
  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  /** False until the address has been read, so the defaults never overwrite a linked view. */
  const [ready, setReady] = useState(false);
  const [recent, setRecent] = useState<RecentFile | null>(null);
  const [everything, setEverything] = useState<Bill[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  /** On a phone the filters start folded away, so the list is the first thing on the page. */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    setFilters(fromQuery(window.location.search));
    setReady(true);
    getJson<RecentFile>('/bills/data/recent.json').then(setRecent).catch(() => setFailed(true));
  }, []);

  const needAll = !recentIsEnough(filters);
  useEffect(() => {
    if (!ready || !needAll || everything) return;
    getJson<{ congress: number; rows: BillRow[] }>('/bills/data/all.json')
      .then((doc) => setEverything(doc.rows.map((row) => toBill(row, doc.congress))))
      .catch(() => setFailed(true));
  }, [ready, needAll, everything]);

  useEffect(() => {
    if (!ready) return;
    window.history.replaceState(null, '', `${window.location.pathname}${toQuery(filters)}`);
    setShown(PAGE_SIZE);
  }, [filters, ready]);

  const recentBills = useMemo(() => (recent ? recent.rows.map((row) => toBill(row, recent.congress)) : null), [recent]);
  const bills = needAll ? everything : (everything ?? recentBills);
  const base = useMemo(() => (bills ? matchExceptStage(bills, filters, today) : []), [bills, filters, today]);
  const results = useMemo(() => (bills ? select(bills, filters, today) : []), [bills, filters, today]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const toggleStage = (n: number) =>
    set({ stages: filters.stages.includes(n) ? filters.stages.filter((x) => x !== n) : [...filters.stages, n] });
  const filtered = toQuery({ ...filters, sort: DEFAULTS.sort, when: DEFAULTS.when }) !== '';

  return (
    <main className="px-4 md:px-7 pt-7 pb-12 flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <p className="m-0 text-label font-semibold uppercase text-navy">Congress / Bills</p>
        <h1 className="m-0 text-[28px] md:text-[32px] leading-tight font-bold text-ink">
          Bills{recent?.congress ? ` in the ${recent.congress}th Congress` : ''}
        </h1>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex-[999_1_320px] min-w-0 flex items-center gap-2.5 min-h-[48px] px-3.5 bg-card border border-lockRule rounded-ctl focus-within:border-navy">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none text-ink2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="sr-only">Search bills</span>
          <input
            type="search"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Search title, number or sponsor"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-base text-ink placeholder:text-ink2"
          />
        </label>
        <div role="group" aria-label="When a bill last moved" className="w-full md:w-auto grid grid-cols-4 md:flex border border-rule rounded-ctl overflow-hidden">
          {WHEN.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filters.when === key} onClick={() => set({ when: key })} className={`min-h-[44px] px-1 md:px-4 border-0 text-[13px] md:text-[14px] font-semibold whitespace-nowrap cursor-pointer ${
                filters.when === key ? 'bg-navy text-white' : 'bg-card text-ink hover:bg-canvas'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <aside aria-label="Filters" className="flex-[1_1_250px] max-w-full md:max-w-[300px] min-w-0 bg-card border border-rule rounded-card p-[18px] flex flex-col gap-[18px]">
          <button
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
            className="md:hidden min-h-[44px] flex items-center justify-between bg-transparent border-0 p-0 text-base font-semibold text-ink cursor-pointer"
          >
            Filters{filtered ? ' (on)' : ''}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={filtersOpen ? 'rotate-180' : ''}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <div className={`${filtersOpen ? 'flex' : 'hidden'} md:flex flex-col gap-[18px]`}>
          <div className="flex flex-col gap-2">
            <h2 className={heading}>How far it got</h2>
            {[5, 4, 3, 2, 1].map((n) => {
              const on = filters.stages.includes(n);
              return (
                <button key={n} type="button" aria-pressed={on} onClick={() => toggleStage(n)} className={`${option(on)} flex items-center justify-between gap-2 text-left`}>
                  {STAGES[n]}
                  <span className="text-meta font-normal text-ink2 tnum">{base.filter((b) => b.stage === n).length.toLocaleString('en-US')}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bill-topic" className={heading}>
              Topic
            </label>
            <select
              id="bill-topic"
              value={filters.topic}
              onChange={(e) => set({ topic: e.target.value })}
              className="min-h-[44px] px-3 bg-card border border-lockRule rounded-ctl text-base text-ink"
            >
              <option value="">All topics</option>
              {(recent?.topics ?? (filters.topic ? [filters.topic] : [])).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <h2 className={heading}>Started in</h2>
            <div className="flex gap-2">
              {([['', 'Either'], ['house', 'House'], ['senate', 'Senate']] as const).map(([key, label]) => (
                <button key={label} type="button" aria-pressed={filters.chamber === key} onClick={() => set({ chamber: key })} className={`${option(filters.chamber === key)} flex-1 min-w-0 px-1.5`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h2 className={heading}>Sponsor&apos;s party</h2>
            <div className="flex gap-2">
              {([['', 'Any', 'Any'], ['D', 'Democratic', 'Dem.'], ['R', 'Republican', 'Rep.']] as const).map(([key, label, short]) => (
                <button key={label} type="button" aria-label={label} aria-pressed={filters.party === key} onClick={() => set({ party: key })} className={`${option(filters.party === key)} flex-1 min-w-0 px-1.5`}>
                  {short}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2.5 min-h-[44px] text-base text-ink cursor-pointer">
            <input type="checkbox" checked={filters.vote} onChange={(e) => set({ vote: e.target.checked })} className="w-5 h-5 accent-navy" />
            Had a floor vote
          </label>
          <label className="flex items-center gap-2.5 min-h-[44px] pt-3 border-t border-ruleSoft text-base text-ink cursor-pointer">
            <input type="checkbox" checked={filters.everything} onChange={(e) => set({ everything: e.target.checked })} className="w-5 h-5 accent-navy" />
            Include amendments and ceremonial measures
          </label>
          {filtered && (
            <button type="button" onClick={() => setFilters({ ...DEFAULTS, when: filters.when, sort: filters.sort })} className="min-h-[44px] bg-card border border-rule rounded-ctl text-[14px] font-semibold text-ink cursor-pointer hover:border-ink3">
              Clear filters
            </button>
          )}
          </div>
        </aside>

        <section aria-label="Results" className="flex-[999_1_560px] min-w-0 flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-base text-ink" role="status">
              {failed ? (
                'The list could not be loaded.'
              ) : !bills ? (
                'Loading…'
              ) : (
                <>
                  <strong>
                    {results.length.toLocaleString('en-US')} {results.length === 1 ? 'bill' : 'bills'}
                  </strong>
                  {filters.q.trim() && filters.when !== 'all' ? <span className="text-ink2"> across the whole Congress</span> : null}
                </>
              )}
            </p>
            <div role="group" aria-label="Sort" className="flex flex-wrap items-center gap-2">
              {SORTS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filters.sort === key}
                  onClick={() => set({ sort: key })}
                  className={`min-h-[44px] px-3.5 rounded-full border text-[14px] font-semibold cursor-pointer ${
                    filters.sort === key ? 'bg-navy border-navy text-white' : 'bg-card border-rule text-ink hover:border-ink3'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <ol className="m-0 p-0 list-none bg-card border border-rule rounded-card empty:hidden">
            {results.slice(0, shown).map((b) => (
              <li key={b.key} className="px-[18px] py-3.5 flex flex-wrap items-start gap-x-5 gap-y-2.5 border-b border-ruleSoft last:border-b-0">
                <div className="flex-[999_1_320px] min-w-0 flex flex-col gap-1">
                  <a
                    href={b.href}
                    {...(b.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="text-heading font-semibold text-ink hover:text-navy"
                  >
                    <span className="text-navy">{b.label}</span> {b.title}
                    {b.external && <span className="sr-only"> (opens on Congress.gov in a new tab)</span>}
                  </a>
                  <p className="m-0 text-body text-ink2">
                    {[b.sponsor && `${b.sponsor} (${PARTY_WORD[b.party] ?? b.party}${b.state ? `-${b.state}` : ''})`, b.topic, `${b.cosponsors.toLocaleString('en-US')} cosponsor${b.cosponsors === 1 ? '' : 's'}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {b.action && (
                    <p className="m-0 text-body text-ink">
                      {b.action} <span className="text-ink2">· {movedWords(b.moved, today)}</span>
                    </p>
                  )}
                </div>
                <div className="flex-none flex flex-col items-start md:items-end gap-1.5">
                  <span className={`text-label font-semibold uppercase px-2 py-1 rounded-chip ${b.stage >= 4 ? 'bg-navy text-white' : 'bg-lockBg text-ink'}`}>
                    {STAGES[b.stage]}
                  </span>
                  {b.external && <span className="text-meta text-ink2">On Congress.gov</span>}
                </div>
              </li>
            ))}
          </ol>
          {bills && !failed && results.length === 0 && <p className="m-0 py-8 text-center text-base text-ink2">No bills match these filters.</p>}
          {results.length > shown && (
            <button type="button" onClick={() => setShown((n) => n + PAGE_SIZE)} className="self-center min-h-[44px] px-5 bg-card border border-rule rounded-ctl text-[14px] font-semibold text-ink cursor-pointer hover:border-ink3">
              Show {Math.min(PAGE_SIZE, results.length - shown)} more
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
