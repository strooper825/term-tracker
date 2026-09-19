'use client';

// CommitteesCard, KeyDatesCard, NextElectionCard: ported from design/src/components.
// LockedTabPanel is the placeholder body of a tab whose data is not published yet.
import { useState } from 'react';
import type { CommitteeRow, ElectionModel, KeyDateRow } from '@/lib/model';

const COMMITTEES_SHOWN = 7;

export function CommitteesCard({ committees }: { committees: CommitteeRow[] }) {
  const [all, setAll] = useState(false);
  const rows = all ? committees : committees.slice(0, COMMITTEES_SHOWN);
  const hidden = committees.length - rows.length;
  return (
    <section className="border border-rule rounded-card bg-card">
      <div className="flex items-baseline justify-between px-[18px] pt-4 pb-[11px]">
        <h2 className="text-heading font-semibold text-ink m-0">Committees</h2>
        <span className="text-label uppercase text-ink3 tnum">
          {committees.length} assignments
        </span>
      </div>
      {rows.map((c) => {
        const chair = c.role === 'Chair'; // subcommittee chairs keep the neutral badge
        return (
          <div
            key={c.name}
            className="flex justify-between items-start gap-2.5 px-[18px] py-2.5 border-t border-rule"
          >
            <span className="text-base text-ink leading-snug">{c.name}</span>
            {/* Chair is a role, not a party signal, so it reads as a filled navy chip -- the
                site's own emphasis color, never a hue with party meaning. */}
            <span
              className={`flex-none text-label uppercase rounded-chip px-1.5 py-0.5 mt-px border ${
                chair ? 'text-white bg-navy border-navy' : 'text-ink3 bg-card border-rule'
              }`}
            >
              {c.role}
            </span>
          </div>
        );
      })}
      {committees.length === 0 && (
        <p className="text-body text-ink4 px-[18px] pb-4 m-0">No assignments recorded.</p>
      )}
      {hidden > 0 && (
        <div className="px-[18px] py-3 border-t border-rule">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="text-label uppercase font-semibold text-ink underline decoration-[#7F92C4] underline-offset-4"
          >
            All {committees.length} assignments →
          </button>
        </div>
      )}
    </section>
  );
}

export function KeyDatesCard({ dates }: { dates: KeyDateRow[] }) {
  return (
    <section className="border border-rule rounded-card bg-card px-[18px] pt-4 pb-[18px]">
      <h2 className="text-heading font-semibold text-ink m-0 mb-3.5">Key dates</h2>
      <div className="flex flex-col">
        {dates.map((d) => (
          <div key={`${d.date} ${d.label}`} className="flex gap-3">
            <div className="flex flex-col items-center flex-none w-2.5">
              <span className="w-2 h-2 rounded-full border-2 border-ink3 bg-card mt-1" />
              <span className="w-px flex-1 bg-rule" />
            </div>
            <div className="pb-4 flex flex-col gap-0.5">
              <div className="text-label uppercase text-ink3 tnum">
                {d.date}
              </div>
              <div className="text-base text-ink leading-snug">{d.label}</div>
            </div>
          </div>
        ))}
        {dates.length === 0 && <p className="text-body text-ink4 m-0">No dates recorded.</p>}
      </div>
    </section>
  );
}

export function NextElectionCard({ election }: { election: ElectionModel | null }) {
  const row = (label: string, value: string | null) => (
    <div className="flex justify-between gap-3 text-meta border-t border-rule pt-2.5">
      <span className="text-ink2">{label}</span>
      <span className={value ? 'text-ink3' : 'text-ink4'}>{value || 'Not yet available'}</span>
    </div>
  );
  return (
    <section className="border border-rule rounded-card bg-card px-[18px] pt-4 pb-[18px]">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-heading font-semibold text-ink m-0">Next election</h2>
        {election && election.daysAway >= 0 && (
          <span className="text-label uppercase text-ink3 tnum">
            {election.daysAway} days away
          </span>
        )}
      </div>
      {election ? (
        <>
          <div className="text-stat font-semibold text-ink tnum leading-none">
            {election.date}
          </div>
          <div className="text-meta text-ink2 mt-0.5">
            {election.kind}
            {election.daysAway < 0 && ` · ${-election.daysAway} days ago`}
          </div>
          {election.onBallot && (
            <div className="mt-3 inline-flex items-center text-label uppercase font-semibold text-white bg-navy rounded-chip px-2 py-[5px]">
              On the ballot
            </div>
          )}
        </>
      ) : (
        <div className="text-body text-ink4">Not yet available</div>
      )}
      <div className="mt-4 flex flex-col gap-2.5">
        {row('Opponent', election?.opponent ?? null)}
        {row('Race rating', election?.rating ?? null)}
      </div>
    </section>
  );
}

const LockGlyph = () => (
  <span className="inline-block w-[9px] h-[9px] border-[1.5px] border-lockInk rounded-[1px] flex-none" />
);

/* A tab whose data is not published yet. Sized like a real panel so the tab does not jump when
   it goes live. */
export function LockedTabPanel({ title, desc }: { title: string; desc: string }) {
  return (
    <section
      aria-label={`${title} (not yet published)`}
      className="border border-dashed border-lockRule rounded-card bg-lockBg p-6 min-h-[260px] flex flex-col justify-between gap-6"
    >
      <div className="flex flex-col gap-2 max-w-[60ch]">
        <div className="flex items-center gap-2">
          <LockGlyph />
          <h2 className="text-heading font-semibold text-ink2 m-0">{title}</h2>
        </div>
        <p className="text-body text-ink3 m-0">{desc}</p>
      </div>
      <div className="text-label uppercase text-ink3">Coming in a future release</div>
    </section>
  );
}
