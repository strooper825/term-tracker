import { useState } from 'react';
import { EVENT_TYPES } from '../data/eventTypes';

const H = 132;

/* weeks: [{ label, counts: { vote, sponsor, cosponsor, committee }, tick }]
   One column per week for the whole term — must fit with no horizontal scroll. */
export default function ActivityTimeline({ weeks }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...weeks.map(w => total(w)));
  const ticks = [0, Math.round(max / 2), max];

  return (
    <section className="border border-rule rounded-card bg-card px-[18px] pt-[18px] pb-3.5">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <h2 className="text-card font-semibold m-0">Legislative activity by week</h2>
        <span className="text-meta text-ink3 tnum">events per week, by type</span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2.5 my-3">
        {EVENT_TYPES.map(t => (
          <span key={t.key} className="flex items-center gap-1.5 text-meta text-ink2">
            <i className="w-2 h-2 rounded-full" style={{ background: t.color }} />{t.label}
          </span>
        ))}
      </div>

      <div className="h-[22px] text-meta text-ink2 tnum border-b border-ruleSoft mb-3">
        {hover || 'Hover a week to see its activity.'}
      </div>

      <div className="flex gap-2">
        <div className="flex-none w-4 relative" style={{ height: H }}>
          {ticks.map(v => (
            <span key={v} className="absolute right-0 translate-y-1/2 text-[9.5px] text-lockInk tnum"
                  style={{ bottom: (v / max) * H }}>{v}</span>
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative" style={{ height: H }}>
            {ticks.map(v => (
              <span key={v} className="absolute left-0 right-0 h-px bg-ruleSoft" style={{ bottom: (v / max) * H }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-px">
              {weeks.map(w => (
                <div key={w.label} title={describe(w)}
                     onMouseEnter={() => setHover(describe(w))} onMouseLeave={() => setHover(null)}
                     className="flex-1 min-w-0 h-full flex flex-col justify-end cursor-default">
                  {[...EVENT_TYPES].reverse().map(t => w.counts[t.key] ? (
                    <div key={t.key} style={{ height: (w.counts[t.key] / max) * H, background: t.color }} />
                  ) : null)}
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-px mt-[7px] pt-1.5 border-t border-rule">
            {weeks.map(w => (
              <div key={w.label} className="flex-1 min-w-0 text-[9.5px] text-ink4 whitespace-nowrap">{w.tick}</div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const total = w => EVENT_TYPES.reduce((a, t) => a + (w.counts[t.key] || 0), 0);
const describe = w => {
  const n = total(w);
  const parts = EVENT_TYPES.filter(t => w.counts[t.key]).map(t => `${t.label} ${w.counts[t.key]}`).join(' · ');
  return `Week of ${w.label} — ${n} ${n === 1 ? 'event' : 'events'}${parts ? ' · ' + parts : ''}`;
};
