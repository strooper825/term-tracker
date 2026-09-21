'use client';

// The Stock trades tab (ADR 0018). Three honest states, kept visibly apart the way "no roll call
// vote" is kept apart from "pending" elsewhere on the site:
//   - a senator: the Senate's disclosure system blocks automated access, so nothing is ingested;
//     the tab says that is a gap in this site, not an empty record;
//   - a House member the Clerk lists no report for: an empty record, stated as what the Clerk holds;
//   - a House member with reports: the trades read from the PDFs, plus every report, including
//     scanned paper forms whose trades this site cannot read.
// Every count and value total is a mart column formatted in src/lib/model.ts.
import { useState } from 'react';
import type { StockFilingRow, StockTradeRow, StockTradesModel } from '@/lib/model';
import { SourceLink } from './SiteChrome';

const PAGE = 25;

function Chip({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'filled' | 'outline' | 'plain' }) {
  const look =
    tone === 'filled'
      ? 'text-white bg-navy border-navy'
      : tone === 'outline'
        ? 'text-navy bg-card border-navy'
        : 'text-ink3 bg-card border-rule';
  return (
    <span className={`flex-none text-label uppercase rounded-chip px-1.5 py-0.5 border ${look}`}>
      {children}
    </span>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink3"
    >
      {children}
      <span aria-hidden="true" className="text-ink3">
        {' '}
        ↗
      </span>
    </a>
  );
}

function Shell({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5 max-w-[960px]">
      {children}
      {footer}
    </div>
  );
}

function Footer({ model, text }: { model: StockTradesModel; text: string }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <p className="text-meta text-ink3 m-0 max-w-[68ch]">{text}</p>
      <SourceLink
        href={model.lookupUrl}
        title={model.status === 'senate_unavailable' ? 'Open the Senate disclosure search' : 'Open the House Clerk disclosure search'}
      />
    </div>
  );
}

/* A senator. Not a locked "coming soon" panel: nothing is on the way, and the record is not empty. */
function SenateUnavailable({ model, name }: { model: StockTradesModel; name: string }) {
  return (
    <section
      aria-labelledby="trades-title"
      className="border border-rule rounded-card bg-card px-[18px] pt-4 pb-[18px] flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id="trades-title" className="text-heading font-semibold text-ink m-0">
          Stock trades
        </h2>
        <Chip tone="outline">Not available for the Senate</Chip>
      </div>
      <p className="text-body text-ink2 leading-relaxed m-0 max-w-[68ch]">
        This site has no stock trade data for senators. Senators file their periodic transaction
        reports in the Senate&rsquo;s own disclosure system, which blocks automated access, so the
        reports cannot be collected here. That is a gap in this site&rsquo;s coverage, not a sign
        that {name} has made no trades. House members&rsquo; reports come from the House Clerk instead.
      </p>
      <a
        href={model.lookupUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start text-base font-semibold text-white bg-navy rounded-ctl px-3.5 py-2"
      >
        Search {name} on the Senate disclosure site ↗
      </a>
    </section>
  );
}

/* A House member the Clerk lists no report for. An empty record, stated as what the Clerk holds. */
function NoFilings({ model, name }: { model: StockTradesModel; name: string }) {
  return (
    <section
      aria-labelledby="trades-title"
      className="border border-rule rounded-card bg-card px-[18px] pt-4 pb-[18px] flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id="trades-title" className="text-heading font-semibold text-ink m-0">
          Stock trades
        </h2>
        <Chip>No reports on file</Chip>
      </div>
      <p className="text-body text-ink2 leading-relaxed m-0 max-w-[68ch]">
        The House Clerk&rsquo;s disclosure index lists no periodic transaction reports for {name}{' '}
        since {model.coversFrom}. A member files one for trades in securities by themselves, a
        spouse or a dependent child; annual financial disclosures, which list holdings, are a
        separate filing and are not shown here.
      </p>
      {model.checkedAt && (
        <p className="text-meta text-ink3 m-0 tnum">Index last checked {model.checkedAt}</p>
      )}
    </section>
  );
}

/* `stacked` figures (a dollar range) sit under their label at every width: on a phone the
   label-left, value-right row leaves a 19-character range no room and it wraps mid-figure. */
function Figure({
  label,
  value,
  note,
  stacked = false,
}: {
  label: string;
  value: string;
  note?: string;
  stacked?: boolean;
}) {
  return (
    <div
      className={
        stacked
          ? 'flex flex-col items-start gap-1.5 min-w-0'
          : 'flex items-baseline justify-between gap-3 min-w-0 md:flex-col md:items-start md:justify-start md:gap-1.5'
      }
    >
      <div className="text-label uppercase text-ink3 leading-tight">{label}</div>
      <div
        className={
          stacked
            ? 'min-w-0'
            : 'flex items-baseline justify-end gap-x-2 flex-wrap min-w-0 md:flex-col md:items-start md:gap-1.5'
        }
      >
        <span
          className={`text-stat font-semibold text-ink tnum leading-none ${stacked ? 'whitespace-nowrap' : ''}`}
        >
          {value}
        </span>
        {note && <span className="text-meta text-ink3 tnum">{note}</span>}
      </div>
    </div>
  );
}

function Summary({ model }: { model: StockTradesModel }) {
  const unread = model.filingsScanned + model.filingsFailed;
  return (
    <section
      aria-labelledby="trades-title"
      className="border border-rule rounded-card bg-card p-[18px] md:p-6 flex flex-col gap-5"
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id="trades-title" className="text-heading font-semibold text-ink m-0">
          Stock trades
        </h2>
        <span className="text-label uppercase text-ink3 tnum">Since {model.coversFrom}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3.5 border border-rule rounded-card p-4">
        <Figure
          label="Reports filed"
          value={model.filings.toLocaleString('en-US')}
          note={unread > 0 ? `${model.filingsParsed} read · ${unread} not readable` : 'all read'}
        />
        <Figure
          label="Trades listed"
          value={model.trades.toLocaleString('en-US')}
          note={
            model.trades > 0
              ? `${model.purchases} purchases · ${model.sales} sales${model.exchanges ? ` · ${model.exchanges} exchanges` : ''}`
              : undefined
          }
        />
        {model.purchasesRange && <Figure label="Purchases, combined value" value={model.purchasesRange} stacked />}
        {model.salesRange && <Figure label="Sales, combined value" value={model.salesRange} stacked />}
      </div>
      {model.trades > 0 && (
        <p className="text-meta text-ink3 m-0 max-w-[68ch]">
          Members report a value range for each trade, not an exact amount. The combined figures add
          the ends of those ranges, so the true total lies between them. A trade in the top range
          (&ldquo;Over $50,000,000&rdquo;) has no upper end, which is why a total can read &ldquo;or
          more&rdquo;.
        </p>
      )}
    </section>
  );
}

function UnreadNotice({ model }: { model: StockTradesModel }) {
  if (model.filingsScanned === 0 && model.filingsFailed === 0) return null;
  const all = model.filingsParsed === 0;
  return (
    <section
      aria-label="Reports whose trades are not listed"
      className="border border-dashed border-lockRule rounded-card bg-lockBg px-[18px] py-4 flex flex-col gap-2"
    >
      <div className="text-label uppercase text-ink2">
        {all ? 'No trades can be listed' : 'Some trades cannot be listed'}
      </div>
      {model.filingsScanned > 0 && (
        <p className="text-body text-ink2 leading-relaxed m-0 max-w-[68ch]">
          {model.filingsScanned} of {model.filings} report{model.filings === 1 ? '' : 's'}{' '}
          {model.filingsScanned === 1 ? 'is a scanned paper form' : 'are scanned paper forms'}: an
          image of the page with no text in it, which this site cannot read. The trades on{' '}
          {model.filingsScanned === 1 ? 'it are' : 'them are'} not listed here; every report is
          linked below so it can be read at the source.
        </p>
      )}
      {model.filingsFailed > 0 && (
        <p className="text-body text-ink2 leading-relaxed m-0 max-w-[68ch]">
          {model.filingsFailed} report{model.filingsFailed === 1 ? '' : 's'} could not be read
          automatically and {model.filingsFailed === 1 ? 'is' : 'are'} flagged below for a person to
          check.
        </p>
      )}
    </section>
  );
}

function TradeCard({ t }: { t: StockTradeRow }) {
  const tone = t.direction === 'purchase' ? 'filled' : t.direction === 'sale' ? 'outline' : 'plain';
  return (
    <article className="flex flex-col gap-1.5 px-[18px] py-3.5 border-t border-rule md:grid md:grid-cols-[112px_minmax(0,1fr)_190px] md:gap-x-4 md:items-start">
      <div className="flex items-baseline gap-2 flex-wrap md:flex-col md:items-start md:gap-1.5">
        <time dateTime={t.isoDate} className="text-label uppercase text-ink3 tnum">
          {t.dateLabel}
        </time>
        <Chip tone={tone}>{t.transaction}</Chip>
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        <h3 className="text-base font-semibold text-ink leading-snug m-0 break-words">
          {t.asset}
          {t.ticker && <span className="text-ink3 font-normal"> · {t.ticker}</span>}
        </h3>
        <p className="text-meta text-ink3 m-0 break-words">
          {t.assetType} · {t.owner}
          {t.heldIn ? ` · held in ${t.heldIn}` : ''}
        </p>
        {t.description && (
          <details className="text-meta text-ink2">
            <summary className="cursor-pointer text-ink3">Filer&rsquo;s description</summary>
            <p className="m-0 mt-1 leading-relaxed break-words">{t.description}</p>
          </details>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap md:flex-col md:items-end md:gap-1.5 md:text-right">
        <span className="text-body text-ink font-semibold tnum whitespace-nowrap">{t.amount}</span>
        <span className="text-meta text-ink3 tnum">{t.filedLabel}</span>
        <a
          href={t.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open the report PDF at this page"
          className="text-label uppercase text-ink2 border border-rule rounded-chip px-2 py-1"
        >
          report ↗
        </a>
      </div>
    </article>
  );
}

function TradeList({ model }: { model: StockTradesModel }) {
  const [shown, setShown] = useState(PAGE);
  if (model.tradeRows.length === 0) return null;
  const visible = model.tradeRows.slice(0, shown);
  const more = model.tradeRows.length - visible.length;
  return (
    <section aria-labelledby="trade-list-title" className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-4 pb-3 flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id="trade-list-title" className="text-heading font-semibold text-ink m-0">
          Trades
        </h2>
        <span className="text-label uppercase text-ink3 tnum">
          {model.tradeRows.length.toLocaleString('en-US')} · newest first
        </span>
      </div>
      {visible.map((t) => (
        <TradeCard key={t.key} t={t} />
      ))}
      {more > 0 && (
        <div className="px-[18px] py-4 border-t border-rule flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="text-label uppercase font-semibold text-ink underline decoration-[#7F92C4] underline-offset-4"
          >
            Show {Math.min(PAGE, more)} more
          </button>
          <span className="text-meta text-ink3 tnum">
            Showing {visible.length.toLocaleString('en-US')} of {model.tradeRows.length.toLocaleString('en-US')}
          </span>
        </div>
      )}
    </section>
  );
}

function FilingRow({ f }: { f: StockFilingRow }) {
  const tone = f.status === 'parsed' ? 'plain' : f.status === 'scanned' ? 'outline' : 'filled';
  return (
    <li className="flex flex-col gap-1 px-[18px] py-3 border-t border-rule md:flex-row md:items-center md:justify-between md:gap-4">
      <div className="flex items-baseline gap-2 flex-wrap min-w-0">
        <time dateTime={f.isoDate} className="text-label uppercase text-ink3 tnum">
          Filed {f.dateLabel}
        </time>
        <Chip tone={tone}>{f.statusLabel}</Chip>
        {f.tradesLabel && <span className="text-meta text-ink3 tnum">{f.tradesLabel}</span>}
        {f.pages !== null && (
          <span className="text-meta text-ink3 tnum">
            {f.pages} page{f.pages === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-3 flex-wrap text-meta">
        {f.error && <span className="text-ink3 break-words">{f.error}</span>}
        <ExternalLink href={f.url}>Report {f.key}</ExternalLink>
      </div>
    </li>
  );
}

function FilingList({ model }: { model: StockTradesModel }) {
  return (
    <section aria-labelledby="filings-title" className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-4 pb-3 flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id="filings-title" className="text-heading font-semibold text-ink m-0">
          All reports
        </h2>
        <span className="text-label uppercase text-ink3 tnum">
          {model.filings} · newest first
        </span>
      </div>
      <ul className="list-none m-0 p-0">
        {model.filingRows.map((f) => (
          <FilingRow key={f.key} f={f} />
        ))}
      </ul>
    </section>
  );
}

export function StockTradesTab({ model, name }: { model: StockTradesModel; name: string }) {
  if (model.status === 'senate_unavailable') {
    return (
      <Shell
        footer={
          <Footer
            model={model}
            text="Senate periodic transaction reports are filed in the Senate’s own system, which this site cannot read. Its search is the record."
          />
        }
      >
        <SenateUnavailable model={model} name={name} />
      </Shell>
    );
  }
  if (model.status === 'no_filings') {
    return (
      <Shell
        footer={
          <Footer
            model={model}
            text="From the House Clerk’s financial disclosure index, refreshed nightly. The Clerk’s search is the record."
          />
        }
      >
        <NoFilings model={model} name={name} />
      </Shell>
    );
  }
  return (
    <Shell
      footer={
        <Footer
          model={model}
          text="Trades are read from the House Clerk’s periodic transaction report PDFs, refreshed nightly, and each links to the page it came from. Reading a PDF can go wrong: check a trade against its report before relying on it. The reports are the record."
        />
      }
    >
      <Summary model={model} />
      <UnreadNotice model={model} />
      <TradeList model={model} />
      <FilingList model={model} />
    </Shell>
  );
}
