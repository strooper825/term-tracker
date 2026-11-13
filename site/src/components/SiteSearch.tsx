'use client';

// The search box on the homepage and /search: members of Congress or bills, matched in the
// browser against two JSON files written at build time and fetched on first use (ADR 0022).
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  billHits,
  search,
  type BillEntry,
  type BillHit,
  type MemberHit,
} from '@/lib/seats';

export type SearchTab = 'members' | 'bills';

const COPY: Record<SearchTab, { label: string; placeholder: string; hint: string }> = {
  members: {
    label: 'Search members of Congress',
    placeholder: 'Search by name or state',
    hint: 'Try a last name, or a state like California.',
  },
  bills: {
    label: 'Search bills and laws',
    placeholder: 'Search by bill number or title',
    hint: 'Try a number like H.R. 1, or a word from the title.',
  },
};

type Loaded<T> = { state: 'idle' | 'loading' | 'failed' } | { state: 'ready'; hits: T[] };

function useIndex<T>(url: string, wanted: boolean, prepare: (raw: never[]) => T[]): Loaded<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: 'idle' });
  const prepareRef = useRef(prepare);
  useEffect(() => {
    if (!wanted || loaded.state !== 'idle') return;
    setLoaded({ state: 'loading' });
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((raw) => setLoaded({ state: 'ready', hits: prepareRef.current(raw) }))
      .catch(() => setLoaded({ state: 'failed' }));
  }, [url, wanted, loaded.state]);
  return loaded;
}

type Hit = { href: string; external?: boolean; primary: string; secondary: string };

export function SiteSearch({
  initialTab = 'members',
  autoFocus = false,
}: {
  initialTab?: SearchTab;
  autoFocus?: boolean;
}) {
  const [tab, setTab] = useState<SearchTab>(initialTab);
  const [query, setQuery] = useState('');
  const [touched, setTouched] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const inputId = useId();

  // /search?bills opens on the Bills tab (the header's "Search bills" link).
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('bills')) {
      setTab('bills');
    }
  }, []);

  const members = useIndex<MemberHit>('/search/members.json', touched && tab === 'members', (raw) => raw as MemberHit[]);
  const bills = useIndex<BillHit>('/search/bills.json', touched && tab === 'bills', (raw) => billHits(raw as BillEntry[]));
  const index = tab === 'members' ? members : bills;

  const results: Hit[] = useMemo(() => {
    if (index.state !== 'ready') return [];
    if (tab === 'members') {
      return search(index.hits as MemberHit[], query).map((h) => ({
        href: h.href,
        external: h.external,
        primary: h.name,
        secondary: h.detail,
      }));
    }
    return search(index.hits as BillHit[], query).map((h) => ({
      href: h.href,
      primary: h.label,
      secondary: h.title,
    }));
  }, [index, tab, query]);

  useEffect(() => setActive(0), [query, tab]);

  const copy = COPY[tab];
  const open = query.trim().length > 0;

  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    if (hit.external) window.open(hit.href, '_blank', 'noopener,noreferrer');
    else window.location.assign(hit.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  const tabButton = (key: SearchTab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => {
        setTab(key);
        input.current?.focus();
      }}
      className={`min-h-[44px] px-[18px] border-[1.5px] border-b-0 rounded-t-card text-[14px] font-semibold cursor-pointer ${
        tab === key ? 'bg-navy border-navy text-white' : 'bg-card border-rule text-ink2 hover:text-ink'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="w-full max-w-[680px] flex flex-col text-left">
      <div role="tablist" aria-label="What to search" className="flex gap-1">
        {tabButton('members', 'Members')}
        {tabButton('bills', 'Bills & laws')}
      </div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(results[active]);
        }}
        className="relative flex items-center gap-2 p-2 bg-card border-[1.5px] border-navy rounded-b-card rounded-tr-card shadow-[0_6px_20px_rgba(51,71,122,0.08)]"
      >
        <label htmlFor={inputId} className="sr-only">
          {copy.label}
        </label>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#57564F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none ml-2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={input}
          id={inputId}
          type="search"
          autoComplete="off"
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
          value={query}
          placeholder={copy.placeholder}
          onFocus={() => setTouched(true)}
          onChange={(e) => {
            setTouched(true);
            setQuery(e.target.value);
          }}
          onKeyDown={onKeyDown}
          className="flex-1 min-w-0 h-11 border-0 outline-none bg-transparent text-[16px] text-ink placeholder:text-ink3"
        />
        <button
          type="submit"
          className="flex-none h-11 px-[22px] border-0 rounded-ctl bg-navy text-white text-[15px] font-semibold cursor-pointer hover:bg-[#26355E]"
        >
          Search
        </button>

        {open && (
          <div className="absolute left-[-1.5px] right-[-1.5px] top-[calc(100%+6px)] z-20 bg-card border border-rule rounded-card shadow-[0_12px_32px_rgba(26,26,25,0.14)] overflow-hidden">
            {index.state === 'loading' || index.state === 'idle' ? (
              <p className="m-0 px-4 py-3 text-body text-ink2">Loading…</p>
            ) : index.state === 'failed' ? (
              <p className="m-0 px-4 py-3 text-body text-ink2">Search could not load. Try reloading the page.</p>
            ) : results.length === 0 ? (
              <p className="m-0 px-4 py-3 text-body text-ink2">No {tab === 'members' ? 'members' : 'bills'} match “{query.trim()}”.</p>
            ) : (
              <ul id={listId} role="listbox" aria-label={copy.label} className="m-0 p-1.5 list-none max-h-[360px] overflow-y-auto">
                {results.map((hit, i) => (
                  <li key={hit.href} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                    <a
                      href={hit.href}
                      {...(hit.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      onMouseEnter={() => setActive(i)}
                      className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-ctl text-ink ${i === active ? 'bg-canvas' : ''}`}
                    >
                      <span className="text-base font-semibold">
                        {hit.primary}
                        {hit.external && (
                          <span className="text-meta font-normal text-ink2"> · official website ↗<span className="sr-only"> (opens in a new tab)</span></span>
                        )}
                      </span>
                      <span className="text-meta text-ink2 line-clamp-2">{hit.secondary}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>
      <p className="mt-2.5 mb-0 text-[13px] text-ink2">{copy.hint}</p>
    </div>
  );
}
