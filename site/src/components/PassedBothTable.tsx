'use client';

// The "Passed both chambers" table. A client component only because "Show all" expands the list
// in place: every row is embedded at build time and nothing is fetched or computed here.
import { useState } from 'react';
import type { PassedRow } from '@/lib/congress';

export const PASSED_SHOWN = 8;

function OutcomeChip({ row }: { row: PassedRow }) {
  const cls =
    row.outcome === 'law'
      ? 'bg-ink text-white border-ink'
      : row.outcome === 'overridden'
        ? 'bg-canvas text-ink border-ink'
        : row.outcome === 'vetoed'
          ? 'bg-card text-ink border-ink'
          : row.outcome === 'adopted'
            ? 'bg-card text-ink2 border-rule'
            : 'bg-card text-ink3 border-rule';
  return (
    <span
      className={`inline-block text-label uppercase font-semibold border rounded-chip px-2 py-1 whitespace-nowrap ${cls}`}
    >
      {row.outcomeLabel}
    </span>
  );
}

const GRID = 'md:grid md:grid-cols-[minmax(0,110px)_minmax(0,1fr)_140px_140px_150px] md:gap-4';

export function PassedBothTable({ rows }: { rows: PassedRow[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, PASSED_SHOWN);
  const hidden = rows.length - shown.length;

  if (rows.length === 0) {
    return (
      <p className="text-body text-ink3 px-[18px] py-4 m-0">
        No bill has passed both chambers.
      </p>
    );
  }

  return (
    <div>
      <div className="border border-rule rounded-card overflow-hidden">
        <div
          className={`hidden ${GRID} px-[18px] py-2.5 bg-[#FAF9F6] border-b border-ruleSoft text-label uppercase text-ink3`}
        >
          <span>Measure</span>
          <span>Title</span>
          <span>House vote</span>
          <span>Senate vote</span>
          <span>Outcome</span>
        </div>
        {shown.map((row) => (
          <div
            key={row.key}
            className={`${GRID} px-[18px] py-3 border-b border-[#F4F2ED] last:border-b-0 flex flex-col gap-1.5 md:items-center`}
          >
            <a
              href={row.href}
              target="_blank"
              rel="noopener noreferrer"
              title="Opens this measure on Congress.gov"
              className="text-base font-semibold text-navy tnum whitespace-nowrap"
            >
              {row.label} <span aria-hidden>↗</span>
              <span className="sr-only"> (opens Congress.gov)</span>
            </a>
            <a
              href={row.billPath}
              className="text-body text-ink leading-snug underline decoration-rule underline-offset-2"
            >
              {row.title}
            </a>
            <span className="text-meta text-ink2 tnum">
              <span className="md:hidden text-label uppercase text-ink3">House </span>
              {row.houseVote}
            </span>
            <span className="text-meta text-ink2 tnum">
              <span className="md:hidden text-label uppercase text-ink3">Senate </span>
              {row.senateVote}
            </span>
            <span>
              <OutcomeChip row={row} />
            </span>
          </div>
        ))}
      </div>
      <div className="pt-3 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-label uppercase text-ink3 tnum">
          Showing {shown.length} of {rows.length} · Newest first · ↗ Opens Congress.gov in a new tab
        </span>
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setAll(true)}
            className="text-label uppercase text-navy border border-navy rounded-ctl px-3 py-[7px] hover:bg-canvas"
          >
            Show all {rows.length} →
          </button>
        )}
      </div>
    </div>
  );
}
