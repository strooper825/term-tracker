// "Current term" and "Record" cards for the Congress activity tab: label-and-value rows over
// mart.member_summary and mart.term_history columns, formatted in src/lib/model.ts.
import type { FactRow, RecordModel } from '@/lib/model';

function FactRows({ rows }: { rows: FactRow[] }) {
  return (
    <dl className="m-0 flex flex-col">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-baseline justify-between gap-4 px-[18px] py-2.5 border-t border-rule"
        >
          <dt className="text-meta text-ink2">{r.label}</dt>
          <dd className="m-0 text-right min-w-0 tnum">
            <span className="text-base font-semibold text-ink">{r.value}</span>
            {r.note && <span className="block text-meta text-ink3">{r.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CurrentTermCard({ rows }: { rows: FactRow[] }) {
  return (
    <section aria-labelledby="term-title" className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-4 pb-[11px]">
        <h2 id="term-title" className="text-heading font-semibold text-ink m-0">
          Current term
        </h2>
      </div>
      <FactRows rows={rows} />
    </section>
  );
}

export function RecordCard({ record }: { record: RecordModel }) {
  return (
    <section aria-labelledby="record-title" className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-4 pb-[11px]">
        <h2 id="record-title" className="text-heading font-semibold text-ink m-0">
          Record
        </h2>
      </div>
      <FactRows rows={record.stats} />
      {record.history.length > 0 && (
        <>
          <div className="px-[18px] pt-3.5 pb-2 border-t border-rule">
            <h3 className="text-label uppercase text-ink3 m-0">Terms in office</h3>
          </div>
          <FactRows rows={record.history} />
        </>
      )}
    </section>
  );
}
