'use client';

// The two long lists on a bill page. Both are client components only because they collapse:
// the data is embedded at build time and nothing is fetched or computed here.
import { useState } from 'react';
import { EVENT_COLOR } from '@/data/eventTypes';
import type { ActionGroup, CosponsorsModel } from '@/lib/model';

const COSPONSORS_SHOWN = 12;
const ACTION_GROUPS_SHOWN = 6;

function MoreButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="px-[18px] py-3">
      <button
        type="button"
        onClick={onClick}
        className="text-sm border border-[#D9D6CF] rounded-ctl px-3 py-[7px] hover:bg-canvas hover:border-lockInk"
      >
        {label}
      </button>
    </div>
  );
}

export function BillCosponsors({ cosponsors }: { cosponsors: CosponsorsModel }) {
  const [all, setAll] = useState(false);
  const rows = all ? cosponsors.rows : cosponsors.rows.slice(0, COSPONSORS_SHOWN);
  const hidden = cosponsors.rows.length - rows.length;
  return (
    <section aria-labelledby="cosponsors-title" className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-4 pb-3 border-b border-ruleSoft flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="cosponsors-title" className="text-card font-semibold text-ink m-0">
            Cosponsors
          </h2>
          <span className="text-meta text-ink3 tnum">{cosponsors.meta}</span>
        </div>
        {cosponsors.total > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {cosponsors.chips.map((chip) => (
              <span
                key={chip.label}
                className="text-label uppercase tracking-[0.05em] text-ink2 bg-[#F6F5F2] border border-rule rounded-chip px-1.5 py-0.5 tnum"
              >
                {chip.label}
              </span>
            ))}
            {cosponsors.withdrawn > 0 && (
              <span className="text-label uppercase tracking-[0.05em] text-ink3 border border-dashed border-rule rounded-chip px-1.5 py-0.5 tnum">
                {cosponsors.withdrawn} withdrawn
              </span>
            )}
          </div>
        )}
      </div>

      {cosponsors.total === 0 ? (
        <p className="text-sm text-ink3 px-[18px] py-4 m-0">
          No member has cosponsored this measure.
        </p>
      ) : (
        <>
          {rows.map((row) => (
            <div
              key={`${row.name} ${row.date}`}
              className="flex justify-between items-baseline gap-3 px-[18px] py-2 border-b border-[#F4F2ED]"
            >
              <span className="min-w-0 text-sm leading-snug">
                {row.href ? (
                  <a href={row.href} className="underline decoration-rule underline-offset-2">
                    {row.name}
                  </a>
                ) : (
                  row.name
                )}
                {row.meta && <span className="text-ink3"> · {row.meta}</span>}
                {row.withdrawn && <span className="text-ink4"> · withdrawn</span>}
              </span>
              <span className="flex-none text-meta text-ink3 tnum">{row.date}</span>
            </div>
          ))}
          {hidden > 0 && (
            <MoreButton label={`Show all ${cosponsors.rows.length}`} onClick={() => setAll(true)} />
          )}
        </>
      )}
    </section>
  );
}

/* Same visual language as the member activity feed: sticky date headers, a coloured dot per
   row. Committee-coloured, because every action is a step through committee or the floor. */
export function BillActions({ groups, meta }: { groups: ActionGroup[]; meta: string }) {
  const [shown, setShown] = useState(ACTION_GROUPS_SHOWN);
  const visible = groups.slice(0, shown);
  return (
    <section aria-labelledby="actions-title" className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-3.5 pb-3 border-b border-ruleSoft flex items-center justify-between gap-3">
        <h2 id="actions-title" className="text-card font-semibold text-ink m-0">
          Action history
        </h2>
        <span className="text-meta text-ink3 tnum">{meta}</span>
      </div>
      {groups.length === 0 && (
        <p className="text-sm text-ink3 px-[18px] py-4 m-0">No actions recorded yet.</p>
      )}
      {visible.map((group) => (
        <div key={group.date}>
          <div className="sticky top-0 z-10 px-[18px] py-2.5 bg-[#FAF9F6] border-b border-ruleSoft text-[11px] uppercase tracking-[0.07em] text-ink3 tnum">
            {group.date}
          </div>
          {group.items.map((item, i) => (
            <div
              key={i}
              className="flex gap-[11px] px-[18px] py-[11px] border-b border-[#F4F2ED] items-start"
            >
              <i
                className="w-2 h-2 rounded-full mt-[5px] flex-none"
                style={{ background: EVENT_COLOR.committee }}
              />
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <p className="text-base leading-snug m-0">{item.text}</p>
                {item.meta && <p className="text-sm text-ink3 m-0">{item.meta}</p>}
              </div>
            </div>
          ))}
        </div>
      ))}
      {shown < groups.length && (
        <MoreButton
          label={`Show ${groups.length - shown} more ${groups.length - shown === 1 ? 'day' : 'days'}`}
          onClick={() => setShown(groups.length)}
        />
      )}
    </section>
  );
}
