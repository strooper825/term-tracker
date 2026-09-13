// Fundraising panel (plan section 2, panel 7): principal campaign committee totals for the
// current cycle. Sits in the first cell of the data-panel grid where its locked placeholder
// was, same border, radius and padding, so the page keeps its shape on release. Every number
// is a mart.member_fundraising column formatted in src/lib/model.ts; the bars are the
// TermProgress treatment (design/src/components/TermProgress.jsx) applied to receipt shares.
import type { FundraisingModel } from '@/lib/model';
import { SourceLink } from './SiteChrome';

export function FundraisingCard({ model }: { model: FundraisingModel }) {
  return (
    <section
      aria-labelledby="fundraising-title"
      className="border border-rule rounded-card bg-card p-4 min-h-[150px] flex flex-col gap-3.5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="fundraising-title" className="text-sm font-semibold m-0">
          Fundraising
        </h2>
        <span className="text-meta text-ink3 tnum">{model.cycleLabel}</span>
      </div>

      {model.filed ? (
        <>
          <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
            {model.stats.map((s) => (
              <div key={s.label} className="flex flex-col gap-0.5 min-w-0" title={s.title}>
                <div className="text-label uppercase text-ink3 leading-tight">{s.label}</div>
                <div className="text-[17px] font-semibold tnum -tracking-[0.01em]">{s.value}</div>
                {s.note && <div className="text-micro text-ink4 tnum">{s.note}</div>}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-[7px]">
            <div className="text-label uppercase text-ink3 leading-tight">
              Where the money came from · share of total raised
            </div>
            {model.shares.map((row) => (
              <div key={row.label} className="flex flex-col gap-[3px]">
                <div className="flex justify-between gap-2 text-meta tnum">
                  <span className="text-ink2 truncate">{row.label}</span>
                  <span className="flex-none">
                    <span className="text-ink3">{row.amount}</span>
                    <span className="text-ink4"> · </span>
                    <span className="text-ink">{row.pctLabel}</span>
                  </span>
                </div>
                <div className="h-1.5 bg-[#EDEBE6] rounded-[3px] overflow-hidden">
                  <div className="h-full bg-ink2" style={{ width: `${row.pct}%` }} />
                </div>
                {row.note && <div className="text-micro text-ink4 leading-snug">{row.note}</div>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-ink3 leading-snug m-0 flex-1">{model.message}</p>
      )}

      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
        <div className="text-micro text-ink4 leading-snug tnum min-w-0">
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
