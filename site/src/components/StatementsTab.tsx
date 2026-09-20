'use client';

// The Public statements tab (ADR 0015). A member whose office publishes a feed the pipeline can
// read gets the releases as a searchable, scrolling list; every other member gets a link to the
// office's own press page. All releases are embedded at build time; search runs in the browser
// over title, topics and the opening text, and every release links to the office's page.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { StatementRow, StatementsModel } from '@/lib/model';
import { SourceLink } from './SiteChrome';

const PAGE = 25;
const EXCERPT = 300;
const WINDOW_BEFORE = 90;

function words(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** The text a card shows under the title: the opening of the release, or, when the search
 *  matched only further in, the stretch around the first match. */
export function excerpt(text: string, terms: string[]): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const lower = flat.toLowerCase();
  const hits = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0);
  const first = hits.length ? Math.min(...hits) : -1;
  if (first < EXCERPT - 60) {
    if (flat.length <= EXCERPT) return flat;
    const cut = flat.slice(0, EXCERPT);
    return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
  }
  const from = Math.max(0, first - WINDOW_BEFORE);
  const window = flat.slice(from, from + EXCERPT);
  const start = window.indexOf(' ') + 1;
  const end = window.lastIndexOf(' ');
  return `…${window.slice(start, end > start ? end : undefined)}…`;
}

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

function Marked({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const escaped = terms.map((t) => t.replace(REGEX_SPECIAL, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  return (
    <>
      {text.split(pattern).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-[#F6E7A8] text-ink rounded-[2px]">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function StatementCard({ s, terms }: { s: StatementRow; terms: string[] }) {
  const text = useMemo(() => excerpt(s.text, terms), [s.text, terms]);
  return (
    <article className="flex flex-col gap-1.5 px-[18px] py-4 border-t border-rule">
      <div className="flex items-baseline gap-2 flex-wrap">
        <time dateTime={s.isoDate} className="text-label uppercase text-ink3 tnum">
          {s.dateLabel}
        </time>
        {s.categories.slice(0, 3).map((c) => (
          <span
            key={c}
            className="text-micro uppercase text-ink3 border border-rule rounded-chip px-1.5 py-0.5"
          >
            {c}
          </span>
        ))}
      </div>
      <h3 className="text-base font-semibold text-ink leading-snug m-0">
        <a
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink3"
        >
          <Marked text={s.title} terms={terms} />
          <span aria-hidden="true" className="text-ink3 no-underline">
            {' '}
            ↗
          </span>
        </a>
      </h3>
      {text && (
        <p className="text-body text-ink2 leading-relaxed m-0 break-words">
          <Marked text={text} terms={terms} />
        </p>
      )}
    </article>
  );
}

function StatementFeed({ model }: { model: StatementsModel }) {
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  const terms = useMemo(() => words(q), [q]);
  const index = useMemo(
    () =>
      model.statements.map((s) => ({
        s,
        hay: `${s.title}\n${s.categories.join(' ')}\n${s.text}`.toLowerCase(),
      })),
    [model.statements],
  );
  const list = useMemo(
    () => (terms.length === 0 ? index : index.filter((r) => terms.every((t) => r.hay.includes(t)))),
    [index, terms],
  );
  const visible = list.slice(0, shown);
  const more = list.length - visible.length;

  // Scrolling to the end of the list loads the next page; the button below does the same for
  // anyone who does not scroll (and where the browser has no IntersectionObserver).
  useEffect(() => {
    const el = sentinel.current;
    if (!el || more <= 0 || typeof IntersectionObserver === 'undefined') return;
    const watcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown((n) => n + PAGE);
      },
      { rootMargin: '400px 0px' },
    );
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [more, visible.length]);

  const count = list.length.toLocaleString('en-US');
  return (
    <section aria-labelledby="statements-title" className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-4 pb-3 flex flex-col gap-[11px]">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 id="statements-title" className="text-heading font-semibold text-ink m-0">
            Press releases
          </h2>
          <span className="text-label uppercase text-ink3 tnum">
            {model.total.toLocaleString('en-US')} from {model.label}
            {model.newest ? ` · newest ${model.newest}` : ''}
          </span>
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setShown(PAGE);
          }}
          placeholder="Search press releases by title, topic or text…"
          aria-label="Search public statements"
          className="text-body bg-[#ECEEF3] border border-rule rounded-ctl px-[10px] py-[8px] focus:border-ink3 focus:outline-none"
        />
        {terms.length > 0 && (
          <p role="status" className="text-meta text-ink3 m-0 tnum">
            {list.length === 0 ? 'No press releases match.' : `${count} matching`}
            {list.length === 0 && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => setQ('')}
                  className="text-navy underline decoration-rule underline-offset-2"
                >
                  Clear search
                </button>
              </>
            )}
          </p>
        )}
      </div>

      {visible.map(({ s }) => (
        <StatementCard key={s.key} s={s} terms={terms} />
      ))}

      {more > 0 && (
        <div ref={sentinel} className="px-[18px] py-4 border-t border-rule flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="text-label uppercase font-semibold text-ink underline decoration-[#7F92C4] underline-offset-4"
          >
            Show {Math.min(PAGE, more)} more
          </button>
          <span className="text-meta text-ink3 tnum">
            Showing {visible.length.toLocaleString('en-US')} of {count}
          </span>
        </div>
      )}
    </section>
  );
}

function PressPageLink({ model, name }: { model: StatementsModel; name: string }) {
  return (
    <section
      aria-labelledby="statements-title"
      className="border border-rule rounded-card bg-card px-[18px] pt-4 pb-[18px] flex flex-col gap-3"
    >
      <h2 id="statements-title" className="text-heading font-semibold text-ink m-0">
        Press releases
      </h2>
      <p className="text-body text-ink2 leading-relaxed m-0 max-w-[62ch]">
        {name}&rsquo;s office does not publish a press-release feed this site can read, so its
        statements are not reproduced here. They are on the office&rsquo;s own website.
      </p>
      <a
        href={model.pressUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start text-base font-semibold text-white bg-navy rounded-ctl px-3.5 py-2"
      >
        Press releases on {model.label} ↗
      </a>
    </section>
  );
}

export function StatementsTab({ model, name }: { model: StatementsModel; name: string }) {
  return (
    <div className="flex flex-col gap-5 max-w-[860px]">
      {model.mode === 'feed' ? <StatementFeed model={model} /> : <PressPageLink model={model} name={name} />}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-meta text-ink3 m-0 max-w-[62ch]">
          {model.mode === 'feed'
            ? `Press releases as published on ${model.label}, refreshed nightly. Search covers each release’s title, topics and opening text. These are the office’s words, not this site’s; its own page is the record.`
            : 'The office’s own page is the record; this site links to it and does not copy it.'}
        </p>
        <SourceLink href={model.pressUrl} title="Open the office’s press page" />
      </div>
    </div>
  );
}
