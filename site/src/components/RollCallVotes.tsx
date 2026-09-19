'use client';

// The member's roll-call votes in the tracked Congress, from mart.member_feed (event_type vote).
// Every row is embedded at build time; this only filters by position, searches, and pages.
import { useMemo, useState } from 'react';
import type { VotePosition, VoteRow } from '@/lib/model';
import { FilterChip } from './FilterChip';
import { DetailsLink, SourceLink } from './SiteChrome';

const PAGE = 10;
const POSITIONS: VotePosition[] = ['Yea', 'Nay', 'Present', 'Not Voting'];

/* Red and blue are reserved for party badges and a member's own vote positions (see
   tailwind.config.js): Yea is red and Nay blue, the pairing the design tokens already name.
   Present and Not Voting stay neutral. */
function PositionChip({ position }: { position: VotePosition }) {
  const cls =
    position === 'Yea'
      ? 'text-white bg-party-r border-party-r'
      : position === 'Nay'
        ? 'text-white bg-party-d border-party-d'
        : 'text-ink3 bg-card border-rule';
  return (
    <span
      className={`flex-none w-[84px] text-center text-label uppercase font-semibold border rounded-chip px-1.5 py-1 ${cls}`}
    >
      {position}
    </span>
  );
}

export function RollCallVotes({ votes, congressLabel }: { votes: VoteRow[]; congressLabel: string }) {
  const [q, setQ] = useState('');
  const [off, setOff] = useState<Partial<Record<VotePosition, boolean>>>({});
  const [shown, setShown] = useState(PAGE);

  const counts = useMemo(
    () => Object.fromEntries(POSITIONS.map((p) => [p, votes.filter((v) => v.position === p).length])),
    [votes],
  );
  const needle = q.trim().toLowerCase();
  const list = useMemo(
    () =>
      votes.filter(
        (v) =>
          !off[v.position] &&
          (!needle || `${v.subject} ${v.secondary} ${v.policyArea ?? ''}`.toLowerCase().includes(needle)),
      ),
    [votes, off, needle],
  );
  const isFiltered = !!needle || Object.values(off).some(Boolean);
  const clear = () => {
    setQ('');
    setOff({});
    setShown(PAGE);
  };

  return (
    <section aria-labelledby="votes-title" className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-4 pb-3 border-b border-rule flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 id="votes-title" className="text-heading font-semibold text-ink m-0">
            Roll call votes
          </h2>
          <span className="text-label uppercase text-ink3 tnum">
            {congressLabel} · {votes.length.toLocaleString('en-US')} recorded · most recent first
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Search votes by bill, question or policy area…"
            aria-label="Search roll call votes"
            className="flex-1 basis-64 min-w-[200px] text-body bg-[#ECEEF3] border border-rule rounded-ctl px-[10px] py-[8px] focus:border-ink3 focus:outline-none"
          />
          <div className="flex gap-1.5 flex-wrap">
            {POSITIONS.map((p) => (
              <FilterChip
                key={p}
                label={p}
                count={counts[p] || 0}
                on={!off[p]}
                onToggle={() => {
                  setOff((o) => ({ ...o, [p]: !o[p] }));
                  setShown(PAGE);
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <ul className="m-0 p-0 list-none">
        {list.slice(0, shown).map((v) => (
          <li
            key={v.key}
            className="flex flex-wrap md:flex-nowrap items-start gap-x-3 gap-y-2 px-[18px] py-3 border-b border-ruleSoft last:border-b-0"
          >
            <PositionChip position={v.position} />
            {/* on a phone the text drops below the chip and the link, at full width */}
            <div className="order-last basis-full md:order-none md:basis-0 flex-1 min-w-0 flex flex-col gap-0.5">
              <p className="text-base font-semibold text-ink leading-snug m-0">{v.subject}</p>
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
            <span className="ml-auto md:ml-0 flex-none">
              {v.detailsHref ? <DetailsLink href={v.detailsHref} /> : <SourceLink href={v.source} />}
            </span>
          </li>
        ))}
      </ul>

      {list.length === 0 && (
        <div className="px-[18px] py-11 flex flex-col items-center gap-3 text-center">
          <p className="text-body text-ink2 m-0">
            {needle ? `No votes match “${q.trim()}”.` : 'No votes match the selected positions.'}
          </p>
          {isFiltered && (
            <button
              type="button"
              onClick={clear}
              className="text-body border border-[#D9D6CF] rounded-ctl px-3 py-[7px] hover:bg-canvas"
            >
              Clear filters
            </button>
          )}
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
