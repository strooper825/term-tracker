'use client';

// The Annual disclosure tab (ADR 0027 to ADR 0031; layout ADR 0033): one read report at a time,
// with a switch between the years read, its figures, its holdings largest first, then debts,
// income, positions, agreements, gifts and travel as short lists. Every report the office lists
// stays linked at the foot. Every figure is a mart column formatted in src/lib/model.ts.
import { useState } from 'react';
import type { AnnualReportRow, AnnualReportsModel, NetWorthModel } from '@/lib/model';
import { SourceLink } from './SiteChrome';

const HOLDINGS_PAGE = 10;

/* "$1,001 - $15,000" as the site writes a range. */
const dash = (s: string) => s.replace(' - ', ' – ');
/* A holding's income, left out when there was none ("None: None (or less than $201)"). */
const earned = (income: string | null) =>
  income && !/^None\b/.test(income) && !/: None\b/.test(income) ? `income ${dash(income)}` : null;

const OFFICE = {
  house: { name: 'The House Clerk', search: 'Open the House Clerk disclosure search' },
  senate: { name: 'The Senate’s eFD', search: 'Open the Senate disclosure search' },
} as const;

function Figure({ label, value, note }: { label: string; value: string; note: string | null }) {
  return (
    <div className="px-[18px] py-4 flex flex-col gap-1 min-w-0 border-b md:border-b-0 md:border-r border-ruleSoft last:border-0">
      <span className="text-label font-semibold uppercase text-ink2">{label}</span>
      <span className="text-stat font-semibold text-ink tnum">{value}</span>
      {note && <span className="text-meta text-ink2 tnum">{note}</span>}
    </div>
  );
}

function ListBlock({ title, note, children }: { title: string; note?: string | null; children: React.ReactNode }) {
  const id = `annual-${title.toLowerCase().replace(/[^a-z]+/g, '-')}-title`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5 min-w-0">
      <h3 id={id} className="m-0 text-heading font-semibold text-ink">{title}</h3>
      {note && <p className="m-0 -mt-1 text-meta text-ink2">{note}</p>}
      <ul className="m-0 p-0 list-none bg-card border border-rule rounded-card">{children}</ul>
    </section>
  );
}

function Line({ title, meta, notes, figure }: { title: string; meta?: string | null; notes?: string | null; figure?: string | null }) {
  return (
    <li className="px-[18px] py-3 flex flex-col gap-0.5 border-b border-ruleSoft last:border-b-0">
      <span className="flex justify-between items-baseline gap-3">
        <span className="text-base font-semibold text-ink break-words min-w-0">{title}</span>
        {figure && <span className="text-base text-ink tnum whitespace-nowrap">{figure}</span>}
      </span>
      {meta && <span className="text-body text-ink2 break-words">{meta}</span>}
      {notes && <span className="text-meta text-ink2 break-words">{notes}</span>}
    </li>
  );
}

function Report({ worth }: { worth: NetWorthModel }) {
  const [shown, setShown] = useState(HOLDINGS_PAGE);
  const visible = worth.holdings.slice(0, shown);
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 bg-card border border-rule rounded-card">
        <Figure label="Assets" value={worth.assets} note={worth.holdingsNote} />
        <Figure label="Debts" value={worth.liabilities} note={worth.liabilitiesNote} />
        {worth.incomeStated && <Figure label="Outside income" value={worth.incomeStated} note={worth.incomeNote} />}
      </div>

      {worth.holdings.length > 0 && (
        <section aria-labelledby="holdings-title" className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h3 id="holdings-title" className="m-0 text-heading font-semibold text-ink">Holdings</h3>
            <span className="text-body text-ink2">
              Largest first ·{' '}
              <a href="#stock-trades" className="text-navy underline underline-offset-2">their trades</a>
            </span>
          </div>
          <ol className="m-0 p-0 list-none bg-card border border-rule rounded-card">
            {visible.map((h) => (
              <li key={h.key} className="px-[18px] py-3 flex flex-wrap justify-between gap-x-5 gap-y-1 border-b border-ruleSoft">
                <div className="flex-[999_1_320px] min-w-0 flex flex-col gap-0.5">
                  <span className="text-base font-semibold text-ink break-words">{h.name}</span>
                  <span className="text-body text-ink2 break-words">
                    {[h.kind, h.owner, h.heldIn ? `in ${h.heldIn}` : null, earned(h.income)].filter(Boolean).join(' · ')}
                  </span>
                  {h.notes && <span className="text-meta text-ink2 break-words">{h.notes}</span>}
                </div>
                <span className="flex-none text-base text-ink tnum">{dash(h.value)}</span>
              </li>
            ))}
            {worth.holdings.length > visible.length && (
              <li className="px-[18px] py-1">
                <button
                  type="button"
                  onClick={() => setShown(worth.holdings.length)}
                  className="min-h-[44px] bg-transparent border-0 p-0 text-[14px] font-semibold text-navy cursor-pointer"
                >
                  Show all {worth.holdings.length.toLocaleString('en-US')} holdings
                </button>
              </li>
            )}
          </ol>
        </section>
      )}

      {(worth.debts.length > 0 || worth.sections.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6 items-start">
          {worth.debts.length > 0 && (
            <ListBlock title="Debts">
              {worth.debts.map((d) => (
                <Line key={d.key} title={d.creditor} figure={dash(d.amount)} meta={[d.kind, d.owner, d.detail].filter(Boolean).join(' · ')} />
              ))}
            </ListBlock>
          )}
          {worth.sections.map((s) => (
            <ListBlock key={s.id} title={s.title} note={s.note}>
              {s.rows.map((r) => (
                <Line key={r.key} title={r.title} meta={r.meta} notes={r.notes} figure={r.figure} />
              ))}
            </ListBlock>
          ))}
        </div>
      )}

      <p className="m-0 text-body text-ink2 max-w-[80ch]">
        {worth.noneReported ? `The report lists no ${worth.noneReported}. ` : ''}
        Values are reported as ranges. Not a net worth: a home need not be listed, though its mortgage usually is.
      </p>
    </>
  );
}

function ReportRow({ r }: { r: AnnualReportRow }) {
  return (
    <li className="px-[18px] py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ruleSoft last:border-b-0">
      <span className="text-body text-ink">
        {r.label}
        <span className="text-ink2 tnum">
          {r.pending ? ` · ${r.note}` : ` · filed ${r.dateLabel}${r.note ? ` · ${r.note}` : ''}`}
        </span>
      </span>
      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-meta text-navy underline underline-offset-2">
        {r.linkLabel}
        <span aria-hidden="true"> ↗</span>
      </a>
    </li>
  );
}

export function AnnualDisclosureTab({ annual, name }: { annual: AnnualReportsModel; name: string }) {
  const [pick, setPick] = useState(0);
  const office = OFFICE[annual.chamber];
  const worth = annual.years[pick] ?? null;
  const footer = (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <p className="text-meta text-ink2 m-0 max-w-[68ch]">
        {office.name} lists these reports; refreshed nightly. Each links to the filing, which is the record.
      </p>
      <SourceLink href={annual.lookupUrl} title={office.search} />
    </div>
  );
  if (annual.status !== 'filed') {
    return (
      <div className="flex flex-col gap-4 max-w-[1120px]">
        <h2 className="m-0 text-stat font-semibold text-ink">Annual disclosure</h2>
        <section className="bg-card border border-rule rounded-card px-6 py-7 flex flex-col gap-2">
          <p className="m-0 text-heading font-semibold text-ink">
            {annual.status === 'unavailable' ? 'Not collected yet' : `No annual report since ${annual.coversFrom}`}
          </p>
          <p className="m-0 text-base text-ink2 max-w-[60ch]">
            {annual.status === 'unavailable'
              ? `This site has not read the ${annual.chamber === 'house' ? 'House Clerk’s' : 'Senate’s eFD'} listing for ${name} yet.`
              : `${office.name} lists none for ${name}.`}
          </p>
        </section>
        {footer}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6 max-w-[1120px]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-stat font-semibold text-ink">Annual disclosure</h2>
          {worth && (
            <span className="text-body text-ink2 tnum">
              {worth.reportLabel} · {worth.filedOn.replace(/^Filed/, 'filed')} ·{' '}
              <a href={worth.url} target="_blank" rel="noopener noreferrer" className="text-navy underline underline-offset-2">
                view report<span aria-hidden="true"> ↗</span>
              </a>
            </span>
          )}
        </div>
        {annual.years.length > 1 && (
          <div role="group" aria-label="Report year" className="flex border border-rule rounded-ctl overflow-hidden">
            {annual.years.map((y, i) => (
              <button
                key={y.year}
                type="button"
                aria-pressed={pick === i}
                onClick={() => setPick(i)}
                className={`min-h-[44px] px-4 border-0 text-[14px] font-semibold tnum cursor-pointer ${
                  pick === i ? 'bg-navy text-white' : 'bg-card text-ink hover:bg-canvas'
                }`}
              >
                {y.year}
              </button>
            ))}
          </div>
        )}
      </div>

      {worth ? (
        <Report key={worth.year} worth={worth} />
      ) : (
        <p className="m-0 px-4 py-3 bg-lockBg border border-dashed border-lockRule rounded-card text-body text-ink2 max-w-[80ch]">
          No report has been read for {name} yet: scanned paper forms cannot be read. Every report is linked below.
        </p>
      )}

      <details open={!worth} className="bg-card border border-rule rounded-card">
        <summary className="min-h-[48px] px-[18px] flex items-center justify-between gap-3 text-base font-semibold text-ink cursor-pointer">
          All {annual.rows.length.toLocaleString('en-US')} reports
          <span className="text-meta font-normal text-ink2">newest first</span>
        </summary>
        <ul className="m-0 p-0 list-none border-t border-ruleSoft">
          {annual.rows.map((r) => (
            <ReportRow key={r.key} r={r} />
          ))}
        </ul>
      </details>
      {footer}
    </div>
  );
}
