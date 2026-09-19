// Fundraising panel (plan section 2, panel 7): principal campaign committee totals for the
// current cycle. It is the main panel of the Election tab, so it takes the tab's wide column:
// totals in a row at stat size, receipt shares in two columns at body size. Every number is a
// mart.member_fundraising column formatted in src/lib/model.ts; the bars are the TermProgress
// treatment (design/src/components/TermProgress.jsx) applied to receipt shares.
import type { FundraisingModel } from '@/lib/model';
import { SourceLink } from './SiteChrome';

export function FundraisingCard({ model }: { model: FundraisingModel }) {
  return (
    <section
      aria-labelledby="fundraising-title"
      className="border border-rule rounded-card bg-card p-[18px] md:p-6 flex flex-col gap-6 overflow-hidden"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="fundraising-title" className="text-heading font-semibold text-ink m-0">
          Fundraising
        </h2>
        <span className="text-label uppercase text-ink3 tnum">
          {model.cycleLabel}
        </span>
      </div>

      {model.filed ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4 border border-rule rounded-card p-4">
            {model.stats.map((s) => (
              <div key={s.label} className="flex flex-col gap-1.5 min-w-0" title={s.title}>
                <div className="text-label uppercase text-ink3 leading-tight">{s.label}</div>
                <div className="text-stat font-semibold text-ink tnum leading-none">{s.value}</div>
                {s.note && <div className="text-meta text-ink3 tnum">{s.note}</div>}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3.5">
            <div className="text-label uppercase text-ink3 leading-tight">
              Where the money came from · share of total raised
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-[18px]">
              {model.shares.map((row) => (
                <div key={row.label} className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-baseline gap-2 text-body tnum">
                    <span className="text-ink min-w-0 leading-snug">{row.label}</span>
                    <span className="flex-none whitespace-nowrap">
                      <span className="text-ink2">{row.amount}</span>
                      <span className="text-ink3"> · </span>
                      <span className="text-ink font-semibold">{row.pctLabel}</span>
                    </span>
                  </div>
                  <div className="h-2 bg-[#ECEEF3] rounded-[3px] overflow-hidden">
                    <div className="h-full bg-navy" style={{ width: `${row.pct}%` }} />
                  </div>
                  {row.note && <div className="text-meta text-ink3 leading-snug">{row.note}</div>}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="text-base text-ink3 leading-snug m-0 flex-1">{model.message}</p>
      )}

      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
        <div className="text-label uppercase text-ink3 leading-snug tnum min-w-0">
          {model.footer.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        {model.sourceUrl && (
          <SourceLink href={model.sourceUrl} title="View this committee on FEC.gov" />
        )}
      </div>
    </section>
  );
}
