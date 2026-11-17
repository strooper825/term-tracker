'use client';

// The Stock trades tab (ADR 0018, ADR 0026, ADR 0032; layout ADR 0033). Laid out like the bill
// search: a search box and a buys/sales switch, a filter panel, and the trades as a list. Three
// honest states stay apart:
//   - a senator while the Senate's disclosure system (eFD) has never been read: a gap in this
//     site, not an empty record;
//   - a member the Clerk (House) or eFD (Senate) lists no report for: an empty record;
//   - a member with reports: the trades read from them, and every report, including scanned
//     paper forms whose trades this site cannot read.
// A trade in an industry one of the member's committees oversees is marked on its row and can be
// filtered to (ADR 0032). Every count is a mart column or a count of the rows the API returned.
import { useMemo, useState } from 'react';
import type { StockFilingRow, StockTradeRow, StockTradesModel } from '@/lib/model';
import { SourceLink } from './SiteChrome';

const PAGE = 25;
/* ADR 0032: what the overlap notes rest on, published whole. */
const OVERLAP_METHODS = '/methodology/committee-industries';

const OFFICE = {
  house: {
    name: 'the House Clerk',
    search: 'Open the House Clerk disclosure search',
    footer: 'From the House Clerk’s periodic transaction reports, refreshed nightly. Each trade links to the page it was read from; the reports are the record.',
    none: 'From the House Clerk’s disclosure index, refreshed nightly. Its search is the record.',
  },
  senate: {
    name: 'the Senate’s eFD',
    search: 'Open the Senate disclosure search',
    footer: 'From the Senate’s eFD periodic transaction reports, refreshed nightly. Each trade links to its report; the reports are the record.',
    none: 'From the Senate’s eFD, refreshed nightly. Its search is the record.',
  },
} as const;

const option = (on: boolean) =>
  `min-h-[44px] px-3 rounded-ctl border-2 text-[14px] text-ink cursor-pointer ${on ? 'border-navy bg-lockBg font-semibold' : 'border-rule bg-card hover:border-ink3'}`;
const heading = 'm-0 text-label font-semibold uppercase text-ink2';

function Footer({ model }: { model: StockTradesModel }) {
  const office = OFFICE[model.chamber];
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <p className="text-meta text-ink2 m-0 max-w-[68ch]">{model.status === 'filed' ? office.footer : office.none}</p>
      <SourceLink href={model.lookupUrl} title={office.search} />
    </div>
  );
}

function Message({ title, children, model }: { title: string; children: React.ReactNode; model: StockTradesModel }) {
  return (
    <div className="flex flex-col gap-4 max-w-[1120px]">
      <h2 className="m-0 text-stat font-semibold text-ink">Stock trades</h2>
      <section className="bg-card border border-rule rounded-card px-6 py-7 flex flex-col gap-2 items-start">
        <p className="m-0 text-heading font-semibold text-ink">{title}</p>
        {children}
      </section>
      <Footer model={model} />
    </div>
  );
}

function TradeRowItem({ t }: { t: StockTradeRow }) {
  const chip =
    t.direction === 'purchase'
      ? 'bg-navy text-white'
      : t.direction === 'sale'
        ? 'bg-lockBg text-ink'
        : 'bg-card text-ink border border-rule';
  const detail = [t.assetType, t.owner, t.industry, t.heldIn ? `in ${t.heldIn}` : null].filter(Boolean).join(' · ');
  return (
    <li
      className={`px-[18px] py-3.5 flex flex-wrap items-start gap-x-5 gap-y-2.5 border-b border-ruleSoft last:border-b-0 ${
        t.overlaps.length ? 'bg-[#F7F8FB]' : ''
      }`}
    >
      <div className="flex-[999_1_320px] min-w-0 flex flex-col gap-1">
        <h3 className="m-0 text-heading font-semibold text-ink break-words">
          {t.ticker && <span className="text-navy">{t.ticker} </span>}
          {t.asset}
        </h3>
        <p className="m-0 text-body text-ink2 break-words">{detail}</p>
        {t.overlaps.map((committee) => (
          <p key={committee} className="m-0 flex items-start gap-2 text-body font-semibold text-[#1F2D52]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none mt-0.5 text-navy">
              <path d="M3 21h18" />
              <path d="M5 21V10l7-5 7 5v11" />
              <path d="M9 21v-6h6v6" />
            </svg>
            <span>
              In an industry the {committee} oversees, a committee this member sits on.{' '}
              <a href={OVERLAP_METHODS} className="font-normal text-navy underline underline-offset-2">
                How this is decided
              </a>
            </span>
          </p>
        ))}
        {t.description && (
          <details className="text-meta text-ink2">
            <summary className="cursor-pointer">Filer&rsquo;s description</summary>
            <p className="m-0 mt-1 leading-relaxed break-words">{t.description}</p>
          </details>
        )}
      </div>
      <div className="flex-none flex flex-col items-start md:items-end gap-1.5 md:text-right">
        <span className={`text-label font-semibold uppercase px-2 py-1 rounded-chip ${chip}`}>{t.transaction}</span>
        <span className="text-body text-ink tnum whitespace-nowrap">{t.amount}</span>
        <span className="text-meta text-ink2 tnum">
          <time dateTime={t.isoDate}>{t.dateLabel}</time> · {t.filedLabel.toLowerCase()} ·{' '}
          <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-navy underline underline-offset-2">
            report<span aria-hidden="true"> ↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </span>
      </div>
    </li>
  );
}

function FilingRow({ f }: { f: StockFilingRow }) {
  return (
    <li className="px-[18px] py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ruleSoft last:border-b-0">
      <span className="text-body text-ink tnum">
        Filed <time dateTime={f.isoDate}>{f.dateLabel}</time>
        <span className="text-ink2">
          {' · '}
          {[f.amendmentLabel, f.statusLabel, f.tradesLabel || null, f.pages !== null ? `${f.pages} page${f.pages === 1 ? '' : 's'}` : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {f.error && <span className="block text-meta text-ink2 break-words">{f.error}</span>}
      </span>
      <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-meta text-navy underline underline-offset-2">
        {f.linkLabel}
        <span aria-hidden="true"> ↗</span>
      </a>
    </li>
  );
}

type Filters = { q: string; dir: 'all' | 'purchase' | 'sale'; oversight: boolean; type: string | null; year: string | null; oldest: boolean };
const DEFAULTS: Filters = { q: '', dir: 'all', oversight: false, type: null, year: null, oldest: false };

function counted(values: string[]): [string, number][] {
  const n = new Map<string, number>();
  values.forEach((v) => n.set(v, (n.get(v) ?? 0) + 1));
  return [...n.entries()];
}

function TradeBrowser({ model }: { model: StockTradesModel }) {
  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  const [shown, setShown] = useState(PAGE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const set = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setShown(PAGE);
  };
  const rows = model.tradeRows;
  const types = useMemo(() => counted(rows.map((t) => t.assetType)).sort((a, b) => b[1] - a[1]), [rows]);
  const years = useMemo(() => counted(rows.map((t) => t.year)).sort((a, b) => b[0].localeCompare(a[0])), [rows]);
  const q = filters.q.trim().toLowerCase();
  const results = rows.filter(
    (t) =>
      (filters.dir === 'all' || t.direction === filters.dir) &&
      (!filters.oversight || t.overlaps.length > 0) &&
      (!filters.type || t.assetType === filters.type) &&
      (!filters.year || t.year === filters.year) &&
      (!q || t.asset.toLowerCase().includes(q) || (t.ticker ?? '').toLowerCase().includes(q)),
  );
  const ordered = filters.oldest ? [...results].reverse() : results;
  const visible = ordered.slice(0, shown);
  const buys = results.filter((t) => t.direction === 'purchase').length;
  const sales = results.filter((t) => t.direction === 'sale').length;
  const filtered = filters.dir !== 'all' || filters.oversight || filters.type !== null || filters.year !== null || q !== '';

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex-[999_1_320px] min-w-0 flex items-center gap-2.5 min-h-[48px] px-3.5 bg-card border border-lockRule rounded-ctl focus-within:border-navy">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none text-ink2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="sr-only">Search trades</span>
          <input
            type="search"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Search company or ticker"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-base text-ink placeholder:text-ink2"
          />
        </label>
        <div role="group" aria-label="Buys or sales" className="w-full md:w-auto grid grid-cols-3 md:flex border border-rule rounded-ctl overflow-hidden">
          {([['all', 'All'], ['purchase', 'Buys'], ['sale', 'Sales']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filters.dir === key}
              onClick={() => set({ dir: key })}
              className={`min-h-[44px] px-4 border-0 text-[14px] font-semibold whitespace-nowrap cursor-pointer ${
                filters.dir === key ? 'bg-navy text-white' : 'bg-card text-ink hover:bg-canvas'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <aside aria-label="Filters" className="flex-[1_1_250px] max-w-full md:max-w-[300px] min-w-0 bg-card border border-rule rounded-card p-[18px] flex flex-col gap-[18px]">
          <label className="flex items-start gap-2.5 min-h-[44px] text-base text-ink cursor-pointer pb-3.5 border-b border-ruleSoft">
            <input
              type="checkbox"
              checked={filters.oversight}
              onChange={(e) => set({ oversight: e.target.checked })}
              className="w-5 h-5 mt-0.5 flex-none accent-navy"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold">In an industry this member&rsquo;s committees oversee</span>
              <span className="text-meta text-ink2 tnum">
                {model.overlapTrades.toLocaleString('en-US')} trade{model.overlapTrades === 1 ? '' : 's'} ·{' '}
                <a href={OVERLAP_METHODS} className="text-navy underline underline-offset-2">
                  how this is decided
                </a>
              </span>
            </span>
          </label>
          <button
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
            className="md:hidden min-h-[44px] flex items-center justify-between bg-transparent border-0 p-0 text-base font-semibold text-ink cursor-pointer"
          >
            More filters{filters.type || filters.year ? ' (on)' : ''}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={filtersOpen ? 'rotate-180' : ''}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <div className={`${filtersOpen ? 'flex' : 'hidden'} md:flex flex-col gap-[18px]`}>
            {types.length > 1 && (
              <div className="flex flex-col gap-2">
                <h3 className={heading}>Asset</h3>
                {types.map(([type, n]) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={filters.type === type}
                    onClick={() => set({ type: filters.type === type ? null : type })}
                    className={`${option(filters.type === type)} flex items-center justify-between gap-2 text-left`}
                  >
                    {type}
                    <span className="text-meta font-normal text-ink2 tnum">{n.toLocaleString('en-US')}</span>
                  </button>
                ))}
              </div>
            )}
            {years.length > 1 && (
              <div className="flex flex-col gap-2">
                <h3 className={heading}>Year traded</h3>
                <div className="flex flex-wrap gap-2">
                  {years.map(([year]) => (
                    <button
                      key={year}
                      type="button"
                      aria-pressed={filters.year === year}
                      onClick={() => set({ year: filters.year === year ? null : year })}
                      className={`${option(filters.year === year)} flex-1 min-w-0 px-1.5`}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => set({ ...DEFAULTS, oldest: filters.oldest })}
              className="min-h-[44px] bg-card border border-rule rounded-ctl text-[14px] font-semibold text-ink cursor-pointer hover:border-ink3"
            >
              Clear filters
            </button>
          </div>
        </aside>

        <section aria-label="Trades" className="flex-[999_1_560px] min-w-0 flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-base text-ink tnum" role="status">
              <strong>{results.length.toLocaleString('en-US')}</strong> trade{results.length === 1 ? '' : 's'}
              <span className="text-ink2">
                {' · '}
                {buys.toLocaleString('en-US')} buy{buys === 1 ? '' : 's'} · {sales.toLocaleString('en-US')} sale{sales === 1 ? '' : 's'}
              </span>
            </p>
            <div role="group" aria-label="Sort" className="flex flex-wrap items-center gap-2">
              {([[false, 'Newest'], [true, 'Oldest']] as const).map(([oldest, label]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={filters.oldest === oldest}
                  onClick={() => set({ oldest })}
                  className={`min-h-[44px] px-3.5 rounded-full border text-[14px] font-semibold cursor-pointer ${
                    filters.oldest === oldest ? 'bg-navy text-white border-navy' : 'bg-card text-ink border-rule hover:border-ink3'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ol className="m-0 p-0 list-none bg-card border border-rule rounded-card empty:hidden">
            {visible.map((t) => (
              <TradeRowItem key={t.key} t={t} />
            ))}
          </ol>
          {results.length === 0 && (
            <p className="m-0 py-8 text-center text-base text-ink2">
              {rows.length === 0 ? 'No trades could be read from these reports.' : 'No trades match these filters.'}
            </p>
          )}
          {results.length === 0 && filtered && rows.length > 0 && (
            <button type="button" onClick={() => set({ ...DEFAULTS })} className="self-center min-h-[44px] px-5 bg-card border border-rule rounded-ctl text-[14px] font-semibold text-ink cursor-pointer hover:border-ink3">
              Clear filters
            </button>
          )}
          {ordered.length > visible.length && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="self-center min-h-[44px] px-5 bg-card border border-rule rounded-ctl text-[14px] font-semibold text-ink cursor-pointer hover:border-ink3"
            >
              Show more
            </button>
          )}
        </section>
      </div>
    </>
  );
}

export function StockTradesTab({ model, name }: { model: StockTradesModel; name: string }) {
  if (model.status === 'senate_unavailable') {
    return (
      <Message model={model} title="Not collected for the Senate yet">
        <p className="m-0 text-base text-ink2 max-w-[60ch]">
          This site has not read the Senate&rsquo;s disclosure system for {name}. That is a gap in this
          site, not a sign that {name} made no trades.
        </p>
        <a href={model.lookupUrl} target="_blank" rel="noopener noreferrer" className="pt-1 text-[14px] font-semibold text-navy underline underline-offset-2">
          Search the Senate&rsquo;s eFD ↗
        </a>
      </Message>
    );
  }
  const office = OFFICE[model.chamber];
  if (model.status === 'no_filings') {
    return (
      <Message model={model} title={`No trade reports since ${model.coversFrom}`}>
        <p className="m-0 text-base text-ink2 max-w-[60ch]">
          {office.name.charAt(0).toUpperCase() + office.name.slice(1)} lists none for {name}, a spouse or
          dependent children this Congress.{model.checkedAt ? ` Last checked ${model.checkedAt}.` : ''}
        </p>
        <div className="flex gap-5 flex-wrap pt-1 text-[14px] font-semibold">
          <a href={model.lookupUrl} target="_blank" rel="noopener noreferrer" className="text-navy underline underline-offset-2">
            Search the source yourself ↗
          </a>
          <a href="#annual-disclosure" className="text-navy underline underline-offset-2">
            What they report owning
          </a>
        </div>
      </Message>
    );
  }
  const unread = model.filingsScanned + model.filingsFailed;
  return (
    <div className="flex flex-col gap-4 max-w-[1120px]">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="m-0 text-stat font-semibold text-ink">Stock trades</h2>
        <span className="text-body text-ink2 tnum">
          {model.filings.toLocaleString('en-US')} report{model.filings === 1 ? '' : 's'} from {office.name} since {model.coversFrom} ·{' '}
          <a href="#trade-reports" className="text-navy underline underline-offset-2">list</a> ·{' '}
          <a href="#annual-disclosure" className="text-navy underline underline-offset-2">what they own</a>
        </span>
      </div>
      {unread > 0 && (
        <p className="m-0 px-4 py-3 bg-lockBg border border-dashed border-lockRule rounded-card text-body text-ink2 max-w-[80ch]">
          {model.filingsScanned > 0 &&
            `${model.filingsScanned} of ${model.filings} report${model.filings === 1 ? '' : 's'} ${model.filingsScanned === 1 ? 'is a scanned paper form' : 'are scanned paper forms'} this site cannot read, so ${model.filingsScanned === 1 ? 'its' : 'their'} trades are not listed. `}
          {model.filingsFailed > 0 &&
            `${model.filingsFailed} report${model.filingsFailed === 1 ? '' : 's'} could not be read automatically. `}
          Every report is in the list below.
        </p>
      )}
      <TradeBrowser model={model} />
      <details id="trade-reports" className="bg-card border border-rule rounded-card">
        <summary className="min-h-[48px] px-[18px] flex items-center justify-between gap-3 text-base font-semibold text-ink cursor-pointer">
          All {model.filings.toLocaleString('en-US')} reports
          <span className="text-meta font-normal text-ink2">newest first</span>
        </summary>
        {model.filingsReplaced > 0 && (
          <p className="m-0 px-[18px] pb-2 text-meta text-ink2">An amendment replaces the report it corrects; only its trades are shown.</p>
        )}
        <ul className="m-0 p-0 list-none border-t border-ruleSoft">
          {model.filingRows.map((f) => (
            <FilingRow key={f.key} f={f} />
          ))}
        </ul>
      </details>
      <Footer model={model} />
    </div>
  );
}
