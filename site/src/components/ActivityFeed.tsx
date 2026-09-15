'use client';

// Ported from design/src/components/ActivityFeed.jsx, with four filters that compose:
// search, event type, policy area, and date range.
import { useMemo, useState } from 'react';
import { EVENT_COLOR, EVENT_TYPES, type EventKey } from '@/data/eventTypes';
import { ALL_DATES, type DateRange, type FeedGroup, type PolicyAreaCount } from '@/lib/model';
import { FilterChip } from './FilterChip';
import { PolicyAreaSelect } from './PolicyAreaSelect';
import { DetailsLink, SourceLink } from './SiteChrome';

const PAGE = 4; // date groups per "Load more"

/* Client-side filtering over the whole term's events, which are embedded in the page at build
   time. Results scroll in a 600px region on desktop; date headers stay sticky. */
export function ActivityFeed({
  groups,
  totals,
  totalLabel,
  policyAreas = [],
  dateRanges = [],
}: {
  groups: FeedGroup[];
  totals: Record<EventKey, number>;
  totalLabel: string;
  policyAreas?: PolicyAreaCount[];
  dateRanges?: DateRange[];
}) {
  const [q, setQ] = useState('');
  const [off, setOff] = useState<Partial<Record<EventKey, boolean>>>({});
  const [areas, setAreas] = useState<Set<string>>(new Set());
  const [rangeKey, setRangeKey] = useState(ALL_DATES);
  const [shown, setShown] = useState(8);
  const [areasOpen, setAreasOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const needle = q.trim().toLowerCase();
  const range = dateRanges.find((r) => r.key === rangeKey);

  // Every filter but policy area, so the notice below can say how many rows the policy filter
  // is the one hiding.
  const beforePolicyArea = useMemo(
    () =>
      groups
        .map((g) => ({
          date: g.date,
          items: g.items.filter(
            (it) =>
              !off[it.type] &&
              (!needle ||
                `${it.lead ?? ''}${it.headline} ${it.secondary}`.toLowerCase().includes(needle)) &&
              (!range?.from || it.isoDate >= range.from) &&
              (!range?.to || it.isoDate <= range.to),
          ),
        }))
        .filter((g) => g.items.length),
    [groups, off, needle, range],
  );

  const filtered = useMemo(() => {
    if (areas.size === 0) return beforePolicyArea;
    return beforePolicyArea
      .map((g) => ({
        date: g.date,
        items: g.items.filter((it) => it.policyArea && areas.has(it.policyArea)),
      }))
      .filter((g) => g.items.length);
  }, [beforePolicyArea, areas]);

  const matchCount = filtered.reduce((a, g) => a + g.items.length, 0);
  const withoutPolicyArea =
    areas.size === 0
      ? 0
      : beforePolicyArea.reduce((a, g) => a + g.items.filter((it) => !it.policyArea).length, 0);

  const activeTypes = EVENT_TYPES.filter((t) => !off[t.key]);
  const isFiltered =
    !!needle || activeTypes.length < EVENT_TYPES.length || areas.size > 0 || rangeKey !== ALL_DATES;

  const clear = () => {
    setQ('');
    setOff({});
    setAreas(new Set());
    setRangeKey(ALL_DATES);
    setShown(8);
  };
  const reset = () => setShown(8);

  const toggleArea = (name: string) => {
    setAreas((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    reset();
  };

  return (
    <section className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-3.5 pb-3 border-b border-rule flex flex-col gap-[11px]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[13.5px] font-semibold text-ink m-0">Record</h2>
          <span className="text-[8.25px] uppercase tracking-[0.03em] text-ink3">
            {totalLabel} events · most recent first
          </span>
        </div>

        {/* Four controls: on a phone they sit behind a disclosure so the card keeps its shape. */}
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
          className="md:hidden self-start flex items-center gap-1.5 text-sm border border-[#D9D6CF] rounded-ctl px-2.5 py-[7px]"
        >
          Filters
          {isFiltered && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-ink2" />}
          <span aria-hidden="true" className="text-ink4">
            {filtersOpen ? '▴' : '▾'}
          </span>
        </button>

        <div className={`${filtersOpen ? 'flex' : 'hidden'} md:flex flex-col gap-[11px]`}>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                reset();
              }}
              placeholder="Search bills, votes, committees…"
              aria-label="Search activity"
              className="flex-none w-full md:w-[240px] text-[10.5px] bg-[#ECEEF3] border border-rule rounded-ctl px-[10px] py-[8px] focus:border-ink3 focus:outline-none"
            />
            {dateRanges.length > 0 && (
              <select
                aria-label="Date range"
                value={rangeKey}
                onChange={(e) => {
                  setRangeKey(e.target.value);
                  reset();
                }}
                className={`text-[10.5px] rounded-ctl px-[10px] py-[8px] border ${
                  rangeKey !== ALL_DATES ? 'border-ink3 bg-[#F2F0EA]' : 'border-rule bg-card'
                }`}
              >
                {dateRanges.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            )}
            <PolicyAreaSelect
              areas={policyAreas}
              selected={areas}
              onToggle={toggleArea}
              onClear={() => {
                setAreas(new Set());
                reset();
              }}
              open={areasOpen}
              onOpenChange={setAreasOpen}
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap max-md:flex-nowrap max-md:overflow-x-auto max-md:pb-1.5 [scrollbar-width:thin]">
            {EVENT_TYPES.map((t) => (
              <FilterChip
                key={t.key}
                label={t.label}
                count={totals[t.key]}
                color={t.color}
                on={!off[t.key]}
                onToggle={() => {
                  setOff((o) => ({ ...o, [t.key]: !o[t.key] }));
                  reset();
                }}
              />
            ))}
          </div>
        </div>

        <div className="flex items-baseline gap-2.5 flex-wrap">
          <span className="text-[8.25px] uppercase tracking-[0.03em] text-ink3 tnum">
            {matchCount.toLocaleString('en-US')} of {totalLabel} events
          </span>
          {isFiltered && (
            <button
              type="button"
              onClick={clear}
              className="text-meta text-ink2 underline decoration-rule underline-offset-2"
            >
              Clear
            </button>
          )}
        </div>

        {withoutPolicyArea > 0 && (
          <p className="text-meta text-ink3 leading-snug m-0 tnum">
            {withoutPolicyArea.toLocaleString('en-US')}{' '}
            {withoutPolicyArea === 1 ? 'event has' : 'events have'} no policy area and{' '}
            {withoutPolicyArea === 1 ? 'is' : 'are'} hidden while this filter is on. Congress.gov
            assigns one to bills, not to nomination votes, procedural roll calls, or amendments.
          </p>
        )}
      </div>

      <div className="relative overflow-visible md:overflow-y-auto md:max-h-[600px]">
        {filtered.slice(0, shown).map((g) => (
          <div key={g.date}>
            <div className="sticky top-0 z-10 px-[18px] py-2.5 bg-[#FAFAFB] border-b border-rule text-[8.25px] uppercase tracking-[0.03em] text-ink3 tnum">
              {g.date}
            </div>
            {g.items.map((it, i) => (
              <div
                key={i}
                className="flex gap-[11px] px-[18px] py-[11px] border-b border-[#F4F2ED] items-start"
              >
                <i
                  className="w-2 h-2 rounded-full mt-[5px] flex-none"
                  style={{ background: EVENT_COLOR[it.type] }}
                />
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <p className="text-[11.25px] font-semibold text-ink leading-snug m-0">
                    {it.lead && <strong className="font-semibold text-ink">{it.lead}</strong>}
                    {it.headline}
                  </p>
                  {it.secondary && (
                    <p
                      className="text-[9.75px] font-normal text-ink2 tnum m-0 line-clamp-2"
                      title={it.secondaryFull ?? it.secondary}
                    >
                      {it.secondary}
                    </p>
                  )}
                  {it.policyArea && (
                    <p className="text-[8.25px] uppercase tracking-[0.03em] text-ink3 m-0">
                      {it.policyArea}
                    </p>
                  )}
                </div>
                {/* One destination per row: the bill page when the mart says there is one,
                    otherwise the record on congress.gov or senate.gov. */}
                {it.detailsHref ? (
                  <DetailsLink href={it.detailsHref} />
                ) : (
                  <SourceLink href={it.source} />
                )}
              </div>
            ))}
          </div>
        ))}

        {matchCount === 0 && (
          <div className="px-[18px] py-11 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-ink2 m-0">
              {needle
                ? `No events match “${q.trim()}” in the selected filters.`
                : 'No events match the selected filters.'}
            </p>
            <button
              type="button"
              onClick={clear}
              className="text-sm border border-[#D9D6CF] rounded-ctl px-3 py-[7px] hover:bg-canvas"
            >
              Clear filters
            </button>
          </div>
        )}

        {matchCount > 0 && shown < filtered.length && (
          <div className="px-[18px] py-3 flex justify-between items-center gap-3">
            <button
              type="button"
              onClick={() => setShown((s) => s + PAGE)}
              className="text-[9px] uppercase tracking-[0.05em] font-semibold text-ink underline decoration-[#7F92C4] underline-offset-4"
            >
              Load more events →
            </button>
            <span className="text-[8.25px] uppercase tracking-[0.03em] text-ink3 tnum">
              Showing {matchCount} of {totalLabel} recorded events
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
