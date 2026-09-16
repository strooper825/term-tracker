'use client';

// Ported from design/src/components/ActivityTimeline.jsx.
import { useState } from 'react';
import { EVENT_TYPES } from '@/data/eventTypes';
import { formatNumber } from '@/lib/format';
import type { Week } from '@/lib/model';

const H = 132;

const total = (w: Week) => EVENT_TYPES.reduce((a, t) => a + (w.counts[t.key] || 0), 0);
const describe = (w: Week) => {
  const n = total(w);
  const parts = EVENT_TYPES.filter((t) => w.counts[t.key])
    .map((t) => `${t.label} ${w.counts[t.key]}`)
    .join(' · ');
  return `Week of ${w.label} — ${n} ${n === 1 ? 'event' : 'events'}${parts ? ' · ' + parts : ''}`;
};

/* buildWeeks() spaces axis labels MIN_TICK_GAP_WEEKS apart assuming a desktop-width column,
   so on a narrow phone screen the columns are too thin for consecutive labels ("Jan 2025",
   "Mar") not to run together. Below the md breakpoint, only every other label renders -- the
   full set still exists in the DOM's weeks data (and each bar's hover title), just not drawn
   -- roughly doubling the gap between labels without touching buildWeeks() or the desktop
   layout, which already had room. */
function labelsHiddenOnMobile(weeks: Week[]): Set<string> {
  const hidden = new Set<string>();
  let seq = 0;
  for (const w of weeks) {
    if (!w.tick) continue;
    if (seq % 2 === 1) hidden.add(w.label);
    seq++;
  }
  return hidden;
}

/* One column per week for the whole range; must fit with no horizontal scroll. */
export function ActivityTimeline({ weeks }: { weeks: Week[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...weeks.map((w) => total(w)));
  const ticks = [0, Math.round(max / 2), max];
  const typeTotal = (key: (typeof EVENT_TYPES)[number]['key']) =>
    weeks.reduce((a, w) => a + (w.counts[key] || 0), 0);
  const hiddenOnMobile = labelsHiddenOnMobile(weeks);

  return (
    <section className="border border-rule rounded-card bg-card px-[18px] pt-[18px] pb-3.5">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <h2 className="text-[13.5px] font-semibold text-ink m-0">Activity</h2>
        <span className="text-[8.25px] uppercase tracking-[0.03em] text-ink3">
          Events per week, by type
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2.5 my-3">
        {EVENT_TYPES.map((t) => (
          <span key={t.key} className="flex items-center gap-1.5 text-[8.25px]">
            <i className="w-2 h-2 rounded-full flex-none" style={{ background: t.color }} />
            <span className="text-ink2">{t.label}</span>
            <span className="text-ink font-semibold tnum">{formatNumber(typeTotal(t.key))}</span>
          </span>
        ))}
      </div>

      <div className="h-[22px] text-meta text-ink2 tnum border-b border-rule mb-3">
        {hover || 'Hover a week to see its activity.'}
      </div>

      <div className="flex gap-2">
        <div className="flex-none w-4 relative" style={{ height: H }}>
          {ticks.map((v) => (
            <span
              key={v}
              className="absolute right-0 translate-y-1/2 text-[7.5px] text-ink3 tnum"
              style={{ bottom: (v / max) * H }}
            >
              {v}
            </span>
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative" style={{ height: H }}>
            {ticks.map((v) => (
              <span
                key={v}
                className="absolute left-0 right-0 h-px bg-ruleSoft"
                style={{ bottom: (v / max) * H }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-px">
              {weeks.map((w) => (
                <div
                  key={w.label}
                  title={describe(w)}
                  onMouseEnter={() => setHover(describe(w))}
                  onMouseLeave={() => setHover(null)}
                  className="flex-1 min-w-0 h-full flex flex-col justify-end cursor-default"
                >
                  {[...EVENT_TYPES].reverse().map((t) =>
                    w.counts[t.key] ? (
                      <div
                        key={t.key}
                        style={{ height: (w.counts[t.key] / max) * H, background: t.color }}
                      />
                    ) : null,
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-px mt-[7px] pt-1.5 border-t border-rule">
            {weeks.map((w) => (
              <div
                key={w.label}
                className={`flex-1 min-w-0 text-[7.5px] uppercase text-ink3 whitespace-nowrap ${
                  hiddenOnMobile.has(w.label) ? 'hidden md:block' : ''
                }`}
              >
                {w.tick}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
