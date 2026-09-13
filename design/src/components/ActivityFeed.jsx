import { useMemo, useState } from 'react';
import { EVENT_TYPES, EVENT_COLOR } from '../data/eventTypes';
import FilterChip from './FilterChip';
import SourceLink from './SourceLink';

const PAGE = 4; // date groups per "Load more"

/* groups: [{ date, items: [{ type, lead, headline, secondary, source }] }]
   Client-side search + type filters. Results scroll in a 600px region on
   desktop (flows on mobile); date headers stay sticky inside that region. */
export default function ActivityFeed({ groups, totals, totalLabel }) {
  const [q, setQ] = useState('');
  const [off, setOff] = useState({});
  const [shown, setShown] = useState(8);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => groups
    .map(g => ({ date: g.date, items: g.items.filter(it =>
      !off[it.type] && (!needle || `${it.headline} ${it.secondary}`.toLowerCase().includes(needle))) }))
    .filter(g => g.items.length), [groups, off, needle]);

  const matchCount = filtered.reduce((a, g) => a + g.items.length, 0);
  const active = EVENT_TYPES.filter(t => !off[t.key]);
  const scopeTotal = active.reduce((a, t) => a + totals[t.key], 0);
  const isFiltered = !!needle || active.length < EVENT_TYPES.length;
  const clear = () => { setQ(''); setOff({}); setShown(8); };

  return (
    <section className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-3.5 pb-3 border-b border-ruleSoft flex flex-col gap-[11px]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-card font-semibold m-0">Activity feed</h2>
          <span className="text-meta text-ink3">Most recent first</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input type="search" value={q} onChange={e => { setQ(e.target.value); setShown(8); }}
            placeholder="Search bills, votes, committees…"
            className="flex-1 basis-60 min-w-[200px] text-sm bg-card border border-[#D9D6CF] rounded-ctl px-2.5 py-[7px] focus:border-ink3 focus:outline-none" />
          <div className="flex gap-1.5 flex-wrap max-md:flex-nowrap max-md:overflow-x-auto max-md:pb-1.5 [scrollbar-width:thin] flex-1">
            {EVENT_TYPES.map(t => (
              <FilterChip key={t.key} label={t.label} count={totals[t.key]} color={t.color} on={!off[t.key]}
                onToggle={() => { setOff(o => ({ ...o, [t.key]: !o[t.key] })); setShown(8); }} />
            ))}
          </div>
        </div>
        <div className="flex items-baseline gap-2.5">
          <span className="text-meta text-ink3 tnum">
            {(needle ? matchCount : scopeTotal).toLocaleString('en-US')} of {totalLabel} events
          </span>
          {isFiltered && <button onClick={clear} className="text-meta text-[#1F4E9C]">Clear</button>}
        </div>
      </div>

      <div className="relative overflow-visible md:overflow-y-auto md:max-h-[600px]">
        {filtered.slice(0, shown).map(g => (
          <div key={g.date}>
            <div className="sticky top-0 z-10 px-[18px] py-2.5 bg-[#FAF9F6] border-b border-ruleSoft text-[11px] uppercase tracking-[0.07em] text-ink3 tnum">
              {g.date}
            </div>
            {g.items.map((it, i) => (
              <div key={i} className="flex gap-[11px] px-[18px] py-[11px] border-b border-[#F4F2ED] items-start">
                <i className="w-2 h-2 rounded-full mt-[5px] flex-none" style={{ background: EVENT_COLOR[it.type] }} />
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <p className="text-base leading-snug m-0">
                    {it.lead && <strong className="font-semibold text-ink">{it.lead}</strong>}{it.headline}
                  </p>
                  <p className="text-sm text-ink3 tnum m-0">{it.secondary}</p>
                </div>
                <SourceLink href={it.source} />
              </div>
            ))}
          </div>
        ))}

        {matchCount === 0 && (
          <div className="px-[18px] py-11 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-ink2 m-0">
              {needle ? `No events match “${q.trim()}” in the selected types.` : 'No events in the selected types.'}
            </p>
            <button onClick={clear} className="text-sm border border-[#D9D6CF] rounded-ctl px-3 py-[7px] hover:bg-canvas">
              Clear filters
            </button>
          </div>
        )}

        {matchCount > 0 && shown < filtered.length && (
          <div className="px-[18px] py-3 flex justify-between items-center gap-3">
            <button onClick={() => setShown(s => s + PAGE)}
              className="text-sm border border-[#D9D6CF] rounded-ctl px-3 py-[7px] hover:bg-canvas hover:border-lockInk">
              Load more events
            </button>
            <span className="text-meta text-ink4 tnum">Showing {matchCount} of {totalLabel} recorded events</span>
          </div>
        )}
      </div>
    </section>
  );
}
