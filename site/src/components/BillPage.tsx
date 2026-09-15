// Bill detail page (/bills/{congress}/{type}/{number}). Server component: every prop is built
// at build time in src/lib/model.ts from GET /bills/{congress}/{type}/{number}, and the two
// client islands only collapse long lists.
import type { BillPageModel, RollCallRow } from '@/lib/model';
import { BillJourney } from './BillJourney';
import { BillActions, BillCosponsors } from './BillLists';
import { Breadcrumb, SiteFooter, SiteHeader, SourceLink } from './SiteChrome';

export interface BillPageProps {
  bill: BillPageModel;
  /** Breadcrumb hops before the bill label, e.g. Members / Rep. Bryan Steil. */
  trail: { label: string; href: string }[];
  lastUpdated: string | null;
}

/* `name` prefixes the value so a bare word reads as what it is: "POLICY AREA Education"
   rather than "EDUCATION" on its own. */
function Chip({ name, children }: { name?: string; children: React.ReactNode }) {
  return (
    <span className="text-label uppercase tracking-[0.05em] text-ink2 bg-[#F6F5F2] border border-rule rounded-chip px-1.5 py-0.5">
      {name && <span className="text-ink4">{name} </span>}
      {children}
    </span>
  );
}

function BillHeader({ bill }: { bill: BillPageModel }) {
  return (
    <div className="flex flex-col gap-3">
      {/* The title leads; the number is an identifier beside it, not the headline. */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-card font-semibold tnum text-ink2">{bill.label}</span>
        <Chip>{bill.kindLabel}</Chip>
        <Chip>{bill.congress}</Chip>
        {bill.policyArea && <Chip name="Policy area">{bill.policyArea}</Chip>}
      </div>
      <h1 className="text-[22px] font-semibold text-ink leading-snug m-0 max-w-[70ch] -tracking-[0.015em]">
        {bill.title}
      </h1>
      <div className="text-sm text-ink2 flex gap-2 flex-wrap">
        <span>
          Sponsored by{' '}
          {bill.sponsorHref ? (
            <a href={bill.sponsorHref} className="underline decoration-rule underline-offset-2">
              {bill.sponsorName}
            </a>
          ) : (
            bill.sponsorName
          )}
          {bill.sponsorMeta && <span className="text-ink3"> ({bill.sponsorMeta})</span>}
        </span>
        <span className="text-[#C6C3BC]">|</span>
        <span className="tnum">Introduced {bill.introduced}</span>
        {bill.amends && (
          <>
            <span className="text-[#C6C3BC]">|</span>
            <span>
              Amends{' '}
              <a href={bill.amends.href} className="underline decoration-rule underline-offset-2">
                {bill.amends.label}
              </a>
            </span>
          </>
        )}
      </div>
      {bill.latestAction && (
        <div className="text-sm text-ink3 leading-snug">
          <span className="tnum">Latest action {bill.latestAction.date}</span>
          {bill.latestAction.text && <> · {bill.latestAction.text}</>}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ bill }: { bill: BillPageModel }) {
  return (
    <section aria-labelledby="summary-title" className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-4 pb-3 border-b border-ruleSoft flex items-baseline justify-between gap-3">
        <h2 id="summary-title" className="text-card font-semibold text-ink m-0">
          Summary
        </h2>
        <span className="text-meta text-ink3">Congressional Research Service</span>
      </div>
      {bill.summary ? (
        <div className="px-[18px] py-4 flex flex-col gap-3">
          <div className="text-meta text-ink3 tnum">
            As of {bill.summary.asOf} · {bill.summary.stage}
          </div>
          <div
            className="text-base text-ink leading-relaxed flex flex-col gap-2.5 [&_p]:m-0 [&_ul]:m-0 [&_ul]:pl-5 [&_ol]:m-0 [&_ol]:pl-5 [&_li]:mb-1 [&_strong]:font-semibold"
            // Sanitised in src/lib/model.ts: an allowlist of formatting tags, every attribute
            // dropped. The source is the CRS summary text from Congress.gov.
            dangerouslySetInnerHTML={{ __html: bill.summary.html }}
          />
          {bill.summary.versions.length > 1 && (
            <div className="border-t border-ruleSoft pt-3 flex flex-col gap-1.5">
              <div className="text-label uppercase text-ink3">
                Earlier versions ({bill.summary.versions.length} in all)
              </div>
              <ul className="m-0 pl-0 list-none flex flex-col gap-1">
                {bill.summary.versions.map((v) => (
                  <li key={`${v.label} ${v.date}`} className="text-meta text-ink2 tnum">
                    {v.date} · {v.label}
                    {v.current && <span className="text-ink4"> · shown above</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink3 leading-snug px-[18px] py-4 m-0">{bill.summaryEmpty}</p>
      )}
    </section>
  );
}

function RollCallCard({ rows, meta }: { rows: RollCallRow[]; meta: string }) {
  return (
    <section aria-labelledby="rollcalls-title" className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-4 pb-3 border-b border-ruleSoft flex items-baseline justify-between gap-3">
        <h2 id="rollcalls-title" className="text-card font-semibold text-ink m-0">
          Roll calls
        </h2>
        <span className="text-meta text-ink3 tnum">{meta}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink3 px-[18px] py-4 m-0">
          No recorded roll call has named this measure.
        </p>
      ) : (
        rows.map((row) => (
          <div
            key={row.anchor}
            id={row.anchor}
            className="px-[18px] py-3 border-b border-[#F4F2ED] flex flex-col gap-1.5 scroll-mt-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-ink tnum">{row.heading}</span>
              <SourceLink href={row.source} title="View the roll call record" />
            </div>
            {row.question && <div className="text-sm text-ink2 leading-snug">{row.question}</div>}
            <div className="text-meta text-ink3 tnum">
              <span className="text-ink font-semibold">{row.tally}</span> · {row.detail}
            </div>
            {row.positions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {row.positions.map((p) => (
                  <span
                    key={p.name}
                    className="text-label uppercase tracking-[0.05em] border border-rule rounded-chip px-1.5 py-0.5 text-ink2"
                  >
                    {p.name}: <span className="text-ink font-semibold">{p.position}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </section>
  );
}

export function BillPage({ bill, trail, lastUpdated }: BillPageProps) {
  return (
    <div className="min-h-screen bg-canvas flex justify-center">
      <div className="w-full max-w-[1280px] bg-sheet border-x border-rule">
        <SiteHeader active="Members" />

        <section className="px-7 pt-5 pb-6 border-b border-rule flex flex-col gap-[18px]">
          <div className="flex items-start justify-between gap-4">
            <Breadcrumb name={bill.label} trail={trail} />
            <SourceLink href={bill.congressGovUrl} title="View this bill on Congress.gov" />
          </div>
          <BillHeader bill={bill} />
        </section>

        <main className="px-7 py-7 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-7 items-start">
          {/* BillJourney lays out the compact stepper and, below it, one card per recorded
              chamber vote (House vote / Senate vote). */}
          {bill.journey.length > 0 && (
            <div className="lg:col-span-2 min-w-0">
              <BillJourney stages={bill.journey} />
            </div>
          )}
          <div className="flex flex-col gap-7 min-w-0">
            <SummaryCard bill={bill} />
            <BillActions groups={bill.actions} meta={bill.actionsMeta} />
          </div>
          <div className="flex flex-col gap-5 min-w-0">
            <BillCosponsors cosponsors={bill.cosponsors} />
            <RollCallCard rows={bill.rollCalls} meta={bill.rollCallsMeta} />
          </div>
        </main>

        <SiteFooter lastUpdated={lastUpdated} />
      </div>
    </div>
  );
}
