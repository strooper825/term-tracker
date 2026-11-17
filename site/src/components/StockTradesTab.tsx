'use client';

// The Stock trades tab (ADR 0018, ADR 0026). Three honest states, kept visibly apart the way "no
// roll call vote" is kept apart from "pending" elsewhere on the site:
//   - a senator while the Senate's disclosure system (eFD) has never been read: nothing is held,
//     and the tab says that is a gap in this site, not an empty record;
//   - a member the Clerk (House) or eFD (Senate) lists no report for: an empty record, stated as
//     what that office holds;
//   - a member with reports: the trades read from them, plus every report, including scanned
//     paper forms whose trades this site cannot read and Senate reports an amendment replaced.
// Every count and value total is a mart column formatted in src/lib/model.ts.
import { useState } from 'react';
import type {
  AnnualReportRow,
  AnnualReportsModel,
  DisclosureSection,
  NetWorthModel,
  StockFilingRow,
  StockTradeRow,
  StockTradesModel,
} from '@/lib/model';
import { SourceLink } from './SiteChrome';

const PAGE = 25;
/* ADR 0032: what the overlap notes rest on, published whole. */
const OVERLAP_METHODS = '/methodology/committee-industries';

/* Who holds the record, in the words each state uses. */
const OFFICE = {
  house: {
    index: 'The House Clerk’s disclosure index',
    checked: 'Index last checked',
    search: 'Open the House Clerk disclosure search',
    none: 'From the House Clerk’s financial disclosure index, refreshed nightly. The Clerk’s search is the record.',
    filed:
      'Trades are read from the House Clerk’s periodic transaction report PDFs, refreshed nightly, and each links to the page it came from. Reading a PDF can go wrong: check a trade against its report before relying on it. The reports are the record.',
  },
  senate: {
    index: 'The Senate’s disclosure search (eFD)',
    checked: 'Search last checked',
    search: 'Open the Senate disclosure search',
    none: 'From the Senate’s eFD disclosure search, refreshed nightly. Its search is the record.',
    filed:
      'Trades are read from the Senate’s eFD periodic transaction reports, refreshed nightly, and each links to its report. Reading a report can go wrong: check a trade against it before relying on it. The reports are the record.',
  },
} as const;

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
        title={OFFICE[model.chamber].search}
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
        reports in the Senate&rsquo;s own disclosure system, which this site does not collect
        yet. That is a gap in this site&rsquo;s coverage, not a sign
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

/* A member the Clerk or eFD lists no report for. An empty record, stated as what that office holds. */
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
        {OFFICE[model.chamber].index} lists no periodic transaction reports for {name} since{' '}
        {model.coversFrom}. A member files one for trades in securities by themselves, a
        spouse or a dependent child; annual financial disclosures, which list holdings, are a
        separate filing and are not shown here.
      </p>
      {model.checkedAt && (
        <p className="text-meta text-ink3 m-0 tnum">
          {OFFICE[model.chamber].checked} {model.checkedAt}
        </p>
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
            ? 'flex flex-col items-start gap-1.5 min-w-0'
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
        {t.industry && <p className="text-meta text-ink3 m-0 break-words">Industry: {t.industry}</p>}
        {t.overlaps.map((note) => (
          <p key={note} className="text-meta text-ink2 m-0 break-words">
            {note} ·{' '}
            <a href={OVERLAP_METHODS} className="underline decoration-[#7F92C4] underline-offset-4">
              how this is decided
            </a>
          </p>
        ))}
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
          title="Open the report this trade is on"
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
      {model.overlapSummary && (
        <p className="px-[18px] pb-3 text-meta text-ink3 m-0 max-w-[68ch]">
          {model.overlapSummary}. A note of overlap, not a finding of wrongdoing:{' '}
          <a href={OVERLAP_METHODS} className="underline decoration-[#7F92C4] underline-offset-4">
            how this is decided
          </a>
          .
        </p>
      )}
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
        {f.amendmentLabel && <Chip>{f.amendmentLabel}</Chip>}
        <Chip tone={f.replaced ? 'plain' : tone}>{f.statusLabel}</Chip>
        {f.tradesLabel && <span className="text-meta text-ink3 tnum">{f.tradesLabel}</span>}
        {f.pages !== null && (
          <span className="text-meta text-ink3 tnum">
            {f.pages} page{f.pages === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-3 flex-wrap text-meta">
        {f.error && <span className="text-ink3 break-words">{f.error}</span>}
        <ExternalLink href={f.url}>{f.linkLabel}</ExternalLink>
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
      {model.filingsReplaced > 0 && (
        <p className="px-[18px] pb-3 text-meta text-ink3 m-0 max-w-[68ch]">
          An amendment restates the report it corrects in full. The replaced report stays listed
          here, but only the amendment&rsquo;s trades are counted and shown.
        </p>
      )}
      <ul className="list-none m-0 p-0">
        {model.filingRows.map((f) => (
          <FilingRow key={f.key} f={f} />
        ))}
      </ul>
    </section>
  );
}

function AnnualRow({ r }: { r: AnnualReportRow }) {
  return (
    <li className="flex flex-col gap-1 px-[18px] py-3 border-t border-rule md:flex-row md:items-center md:justify-between md:gap-4">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-base font-semibold text-ink">{r.label}</span>
        <span className="text-meta text-ink3 tnum">
          {r.pending ? null : (
            <>
              Filed <time dateTime={r.isoDate}>{r.dateLabel}</time>
            </>
          )}
          {r.note && (r.pending ? r.note : ` \u00b7 ${r.note}`)}
        </span>
      </div>
      <div className="flex items-baseline gap-3 flex-wrap text-meta">
        <ExternalLink href={r.url}>{r.linkLabel}</ExternalLink>
      </div>
    </li>
  );
}

const HOLDINGS_PAGE = 10;

/* Income, positions, agreements, gifts or travel from a read report (ADR 0030). */
function DisclosureList({ section }: { section: DisclosureSection }) {
  const titleId = `annual-${section.id}-title`;
  return (
    <section aria-labelledby={titleId} className="border border-rule rounded-card">
      <div className="px-[18px] pt-3 pb-2 flex flex-col gap-1">
        <h3 id={titleId} className="text-base font-semibold text-ink m-0">
          {section.title}
        </h3>
        {section.note && <p className="text-meta text-ink3 m-0 max-w-[68ch]">{section.note}</p>}
      </div>
      <ul className="list-none m-0 p-0">
        {section.rows.map((r) => (
          <li
            key={r.key}
            className="flex flex-col gap-1 px-[18px] py-2.5 border-t border-rule md:flex-row md:items-baseline md:justify-between md:gap-4"
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-base text-ink break-words">{r.title}</span>
              {r.meta && <span className="text-meta text-ink3 break-words">{r.meta}</span>}
              {r.notes && <span className="text-meta text-ink3 break-words max-w-[68ch]">{r.notes}</span>}
            </div>
            {r.figure && (
              <span className="text-body text-ink font-semibold tnum whitespace-nowrap">{r.figure}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NetWorth({ worth }: { worth: NetWorthModel }) {
  const [shown, setShown] = useState(HOLDINGS_PAGE);
  const visible = worth.holdings.slice(0, shown);
  const more = worth.holdings.length - visible.length;
  return (
    <div className="flex flex-col gap-4 px-[18px] pb-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 border border-rule rounded-card p-4">
        <Figure label={`Reported assets, ${worth.year}`} value={worth.assets} note={worth.holdingsNote} stacked />
        <Figure label={`Reported debts, ${worth.year}`} value={worth.liabilities} note={worth.liabilitiesNote} stacked />
      </div>
      <p className="text-meta text-ink3 m-0 max-w-[68ch]">
        From the {worth.reportLabel.charAt(0).toLowerCase() + worth.reportLabel.slice(1)} (
        <ExternalLink href={worth.url}>{worth.filedLabel}</ExternalLink>). Members report each
        asset and debt as a value range, so each total is a range too. The two are not a net
        worth: a home a member lives in does not have to be listed, but the mortgage on it usually
        is. A spouse&rsquo;s and dependent children&rsquo;s holdings are included.
      </p>
      {worth.holdings.length > 0 && (
        <section aria-labelledby="holdings-title" className="border border-rule rounded-card">
          <div className="px-[18px] pt-3 pb-2 flex items-baseline justify-between gap-3 flex-wrap">
            <h3 id="holdings-title" className="text-base font-semibold text-ink m-0">
              Holdings
            </h3>
            <span className="text-label uppercase text-ink3 tnum">largest first</span>
          </div>
          <ul className="list-none m-0 p-0">
            {visible.map((h) => (
              <li
                key={h.key}
                className="flex flex-col gap-1 px-[18px] py-2.5 border-t border-rule md:flex-row md:items-baseline md:justify-between md:gap-4"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-base text-ink break-words">{h.name}</span>
                  <span className="text-meta text-ink3 break-words">
                    {[h.kind, h.owner, h.heldIn ? `in ${h.heldIn}` : null].filter(Boolean).join(' \u00b7 ')}
                  </span>
                  {h.income && <span className="text-meta text-ink3">Income {h.income}</span>}
                  {h.notes && <span className="text-meta text-ink3 break-words">{h.notes}</span>}
                </div>
                <span className="text-body text-ink font-semibold tnum whitespace-nowrap">{h.value}</span>
              </li>
            ))}
          </ul>
          {more > 0 && (
            <div className="px-[18px] py-3 border-t border-rule flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShown(worth.holdings.length)}
                className="text-label uppercase font-semibold text-ink underline decoration-[#7F92C4] underline-offset-4"
              >
                Show all {worth.holdings.length}
              </button>
            </div>
          )}
        </section>
      )}
      {worth.debts.length > 0 && (
        <section aria-labelledby="debts-title" className="border border-rule rounded-card">
          <div className="px-[18px] pt-3 pb-2">
            <h3 id="debts-title" className="text-base font-semibold text-ink m-0">
              Debts
            </h3>
          </div>
          <ul className="list-none m-0 p-0">
            {worth.debts.map((d) => (
              <li
                key={d.key}
                className="flex flex-col gap-1 px-[18px] py-2.5 border-t border-rule md:flex-row md:items-baseline md:justify-between md:gap-4"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-base text-ink break-words">
                    {`${d.kind} \u00b7 ${d.creditor}`}
                  </span>
                  <span className="text-meta text-ink3">
                    {[d.owner, d.detail].filter(Boolean).join(' \u00b7 ')}
                  </span>
                </div>
                <span className="text-body text-ink font-semibold tnum whitespace-nowrap">{d.amount}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {worth.sections.map((section) => (
        <DisclosureList key={section.id} section={section} />
      ))}
      {worth.noneReported && (
        <p className="text-meta text-ink3 m-0">
          The report lists no {worth.noneReported}.
        </p>
      )}
    </div>
  );
}

/* The annual financial disclosures (ADR 0027, ADR 0028): every report listed and linked, and for
   a member whose newest report has been read, what it adds up to.
   They sit above the trades because they are the fuller record: holdings, income and debts. */
function AnnualReports({ annual, name }: { annual: AnnualReportsModel; name: string }) {
  const office = OFFICE[annual.chamber];
  return (
    <section aria-labelledby="annual-title" className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-4 pb-3 flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 id="annual-title" className="text-heading font-semibold text-ink m-0">
            Annual financial disclosures
          </h2>
          {annual.status === 'filed' && (
            <span className="text-label uppercase text-ink3 tnum">
              {annual.rows.length} · newest first
            </span>
          )}
        </div>
        <p className="text-meta text-ink3 m-0 max-w-[68ch]">
          Each year members report what they own, owe and earn outside their salary, as value
          ranges.{' '}
          {annual.worth
            ? 'The newest report is summarised below; every report is listed after it.'
            : 'This site lists the reports and links to them; it does not read them yet.'}
        </p>
        {annual.status === 'unavailable' && (
          <p className="text-body text-ink2 m-0 max-w-[68ch]">
            Not collected yet for {name}. {office.index} is the record.
          </p>
        )}
        {annual.status === 'no_filings' && (
          <p className="text-body text-ink2 m-0 max-w-[68ch]">
            {office.index} lists no annual report for {name} since {annual.coversFrom}.
          </p>
        )}
      </div>
      {annual.worth && <NetWorth worth={annual.worth} />}
      {annual.status === 'filed' && (
        <ul className="list-none m-0 p-0">
          {annual.rows.map((r) => (
            <AnnualRow key={r.key} r={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function StockTradesTab({
  model,
  annual,
  name,
}: {
  model: StockTradesModel;
  annual: AnnualReportsModel;
  name: string;
}) {
  const reports = <AnnualReports annual={annual} name={name} />;
  if (model.status === 'senate_unavailable') {
    return (
      <Shell
        footer={
          <Footer
            model={model}
            text="Senate periodic transaction reports are filed in the Senate’s own system, which this site does not collect yet. Its search is the record."
          />
        }
      >
        {reports}
        <SenateUnavailable model={model} name={name} />
      </Shell>
    );
  }
  if (model.status === 'no_filings') {
    return (
      <Shell
        footer={<Footer model={model} text={OFFICE[model.chamber].none} />}
      >
        {reports}
        <NoFilings model={model} name={name} />
      </Shell>
    );
  }
  return (
    <Shell
      footer={<Footer model={model} text={OFFICE[model.chamber].filed} />}
    >
      {reports}
      <Summary model={model} />
      <UnreadNotice model={model} />
      <TradeList model={model} />
      <FilingList model={model} />
    </Shell>
  );
}
