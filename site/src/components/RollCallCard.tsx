'use client';

// The bill page's Roll calls card. A client island for the same reason as BillLists.tsx: the
// data is embedded at build time, and collapsing, filtering, and expanding one roll call's
// tracked-member positions happen entirely in the browser over that already-fetched list.
//
// At twenty tracked members a chamber roll call carries about ten chips (all of a chamber's
// tracked members), which is already dense; the plan tracks toward 535, so this has to hold up
// well past today's count. Below COLLAPSE_THRESHOLD positions, none of the controls below
// render at all -- the six-member-era card looked exactly like this, and should keep looking
// this plain until a list actually needs help.
import { useMemo, useState } from 'react';
import type { RollCallRow } from '@/lib/model';
import { SourceLink } from './SiteChrome';

const COLLAPSE_THRESHOLD = 5;

function PositionChip({ name, position }: { name: string; position: string }) {
  return (
    <span className="text-label uppercase border border-rule rounded-chip px-1.5 py-0.5 text-ink2">
      {name}: <span className="text-ink font-semibold">{position}</span>
    </span>
  );
}

function RollCallPositions({
  positions,
  summary,
}: {
  positions: RollCallRow['positions'];
  summary: RollCallRow['positionSummary'];
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const needsControls = positions.length > COLLAPSE_THRESHOLD;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? positions.filter((p) => p.name.toLowerCase().includes(q)) : positions;
  }, [positions, query]);

  const showingAll = !needsControls || expanded || query.trim() !== '';
  const visible = showingAll ? filtered : filtered.slice(0, COLLAPSE_THRESHOLD);
  const hiddenCount = filtered.length - visible.length;

  if (positions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mt-0.5">
      {needsControls && summary.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-ink3 tnum">
          {summary.map((line) => (
            <span key={line.label}>
              {line.label}: <span className="text-ink2 font-medium">{line.text}</span>
            </span>
          ))}
        </div>
      )}
      {needsControls && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search this vote by name…"
          aria-label="Search this roll call by name"
          className="text-body bg-[#ECEEF3] border border-rule rounded-ctl px-[10px] py-[6px] w-full max-w-[240px] focus:border-ink3 focus:outline-none"
        />
      )}
      {filtered.length === 0 ? (
        <p className="text-meta text-ink3 m-0">No tracked member matches &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {visible.map((p) => (
            <PositionChip key={p.name} name={p.name} position={p.position} />
          ))}
        </div>
      )}
      {needsControls && !query && (hiddenCount > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="self-start text-label uppercase font-semibold text-ink underline decoration-[#C9CED2] underline-offset-4"
        >
          {expanded ? 'Show fewer' : `Show all ${positions.length}`}
        </button>
      )}
    </div>
  );
}

export function RollCallCard({ rows, meta }: { rows: RollCallRow[]; meta: string }) {
  return (
    <section aria-labelledby="rollcalls-title" className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-4 pb-3 border-b border-ruleSoft flex items-baseline justify-between gap-3">
        <h2 id="rollcalls-title" className="text-heading font-semibold text-ink m-0">
          Roll calls
        </h2>
        <span className="text-meta text-ink3 tnum">{meta}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-body text-ink3 px-[18px] py-4 m-0">
          No recorded roll call has named this measure.
        </p>
      ) : (
        rows.map((row) => (
          <div
            key={row.anchor}
            id={row.anchor}
            className="px-[18px] py-3 border-b border-[#F4F2ED] flex flex-col gap-1.5 scroll-mt-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-base font-semibold text-ink tnum">{row.heading}</span>
              <SourceLink href={row.source} title="View the roll call record" />
            </div>
            {row.question && <div className="text-body text-ink2 leading-snug">{row.question}</div>}
            <div className="text-meta text-ink3 tnum">
              <span className="text-ink font-semibold">{row.tally}</span> · {row.detail}
            </div>
            <RollCallPositions positions={row.positions} summary={row.positionSummary} />
          </div>
        ))
      )}
    </section>
  );
}
