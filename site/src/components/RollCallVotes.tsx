'use client';

// The member's roll-call votes in the tracked Congress, from mart.member_feed (event_type vote).
// Every row is embedded at build time; this filters them by search, date range, policy area and
// position, and pages through the result. The filters compose.
import { useMemo, useState } from 'react';
import { ALL_DATES, type DateRange, type PolicyAreaCount, type VotePosition, type VoteRow } from '@/lib/model';
import { FilterChip } from './FilterChip';
import { PolicyAreaSelect } from './PolicyAreaSelect';
import { DetailsLink, SourceLink } from './SiteChrome';

const PAGE = 10;
const POSITIONS: VotePosition[] = ['Yea', 'Nay', 'Present', 'Not Voting'];

export function RollCallVotes({
  votes,
  congressLabel,
  policyAreas = [],
  dateRanges = [],
}: {
  votes: VoteRow[];
  congressLabel: string;
  policyAreas?: PolicyAreaCount[];
  dateRanges?: DateRange[];
}) {
  const [q, setQ] = useState('');
  const [off, setOff] = useState<Partial<Record<VotePosition, boolean>>>({});
  const [areas, setAreas] = useState<Set<string>>(new Set());
  const [rangeKey, setRangeKey] = useState(ALL_DATES);
  const [shown, setShown] = useState(PAGE);
  const [areasOpen, setAreasOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const counts = useMemo(
    () => Object.fromEntries(POSITIONS.map((p) => [p, votes.filter((v) => v.position === p).length])),
    [votes],
  );
  const needle = q.trim().toLowerCase();
  const range = dateRanges.find((r) => r.key === rangeKey);

  // Every filter but policy area, so the notice below can say how many votes the policy filter
  // is the one hiding.
  const beforePolicyArea = useMemo(
    () =>
      votes.filter(
        (v) =>
          !off[v.position] &&
          (!needle ||
            `${v.lead}${v.subject} ${v.secondary} ${v.policyArea ?? ''}`.toLowerCase().includes(needle)) &&
          (!range?.from || v.isoDate >= range.from) &&
          (!range?.to || v.isoDate <= range.to),
      ),
    [votes, off, needle, range],
  );
  const list = useMemo(
    () =>
      areas.size === 0
        ? beforePolicyArea
        : beforePolicyArea.filter((v) => v.policyArea && areas.has(v.policyArea)),
    [beforePolicyArea, areas],
  );
  const withoutPolicyArea =
    areas.size === 0 ? 0 : beforePolicyArea.filter((v) => !v.policyArea).length;

  const isFiltered =
    !!needle || Object.values(off).some(Boolean) || areas.size > 0 || rangeKey !== ALL_DATES;
  const reset = () => setShown(PAGE);
  const clear = () => {
    setQ('');
    setOff({});
    setAreas(new Set());
    setRangeKey(ALL_DATES);
    reset();
  };
  const toggleArea = (name: string) => {
    setAreas((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    reset();
  };
  const total = votes.length.toLocaleString('en-US');

  return (
    <section aria-labelledby="votes-title" className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-4 pb-3 border-b border-rule flex flex-col gap-[11px]">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 id="votes-title" className="text-heading font-semibold text-ink m-0">
            Roll call votes
          </h2>
          <span className="text-label uppercase text-ink3 tnum">
            {congressLabel} · {total} recorded · most recent first
          </span>
        </div>

        {/* Four controls: on a phone they sit behind a disclosure so the card keeps its shape. */}
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
          className="md:hidden self-start flex items-center gap-1.5 text-body border border-[#D9D6CF] rounded-ctl px-2.5 py-[7px]"
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
              placeholder="Search votes by bill, question or policy area…"
              aria-label="Search roll call votes"
              className="flex-1 basis-64 min-w-[200px] text-body bg-[#ECEEF3] border border-rule rounded-ctl px-[10px] py-[8px] focus:border-ink3 focus:outline-none"
            />
            {dateRanges.length > 0 && (
              <select
                aria-label="Date range"
                value={rangeKey}
                onChange={(e) => {
                  setRangeKey(e.target.value);
                  reset();
                }}
                className={`text-body rounded-ctl px-[10px] py-[8px] border ${
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
            {POSITIONS.map((p) => (
              <FilterChip
                key={p}
                label={p}
                count={counts[p] || 0}
                on={!off[p]}
                onToggle={() => {
                  setOff((o) => ({ ...o, [p]: !o[p] }));
                  reset();
                }}
              />
            ))}
          </div>
        </div>

        <div className="flex items-baseline gap-2.5 flex-wrap">
          <span className="text-label uppercase text-ink3 tnum">
            {list.length.toLocaleString('en-US')} of {total} votes
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
            {withoutPolicyArea === 1 ? 'vote has' : 'votes have'} no policy area and{' '}
            {withoutPolicyArea === 1 ? 'is' : 'are'} hidden while this filter is on. Congress.gov
            assigns one to bills, not to nomination votes or procedural roll calls.
          </p>
        )}
      </div>

      <ul className="m-0 p-0 list-none">
        {list.slice(0, shown).map((v) => (
          <li
            key={v.key}
            className="flex items-start gap-3 px-[18px] py-[11px] border-b border-ruleSoft last:border-b-0"
          >
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <p className="text-base font-semibold text-ink leading-snug m-0">
                {v.lead && <strong className="font-semibold text-ink">{v.lead}</strong>}
                {v.subject}
              </p>
              {v.secondary && (
                <p
                  className="text-meta text-ink2 tnum m-0 line-clamp-2"
                  title={v.secondaryFull ?? v.secondary}
                >
                  {v.secondary}
                </p>
              )}
              <p className="text-label uppercase text-ink3 tnum m-0">
                {v.date}
                {v.policyArea ? ` · ${v.policyArea}` : ''}
              </p>
            </div>
            {v.detailsHref ? <DetailsLink href={v.detailsHref} /> : <SourceLink href={v.source} />}
          </li>
        ))}
      </ul>

      {list.length === 0 && (
        <div className="px-[18px] py-11 flex flex-col items-center gap-3 text-center">
          <p className="text-body text-ink2 m-0">
            {needle
              ? `No votes match “${q.trim()}” in the selected filters.`
              : 'No votes match the selected filters.'}
          </p>
          <button
            type="button"
            onClick={clear}
            className="text-body border border-[#D9D6CF] rounded-ctl px-3 py-[7px] hover:bg-canvas"
          >
            Clear filters
          </button>
        </div>
      )}

      {shown < list.length && (
        <div className="px-[18px] py-3 border-t border-rule flex justify-between items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setShown((s) => s + PAGE)}
            className="text-label uppercase font-semibold text-ink underline decoration-[#7F92C4] underline-offset-4"
          >
            Show {Math.min(PAGE, list.length - shown)} more →
          </button>
          <span className="text-label uppercase text-ink3 tnum">
            Showing {shown} of {list.length.toLocaleString('en-US')}
            {isFiltered ? ' matching' : ''}
          </span>
        </div>
      )}
    </section>
  );
}
