'use client';

// CommitteesCard, KeyDatesCard, NextElectionCard, LockedPanels: ported from design/src/components.
import { type ReactNode, useState } from 'react';
import type { CommitteeRow, ElectionModel, KeyDateRow } from '@/lib/model';

const COMMITTEES_SHOWN = 7;

export function CommitteesCard({ committees }: { committees: CommitteeRow[] }) {
  const [all, setAll] = useState(false);
  const rows = all ? committees : committees.slice(0, COMMITTEES_SHOWN);
  const hidden = committees.length - rows.length;
  return (
    <section className="border border-rule rounded-card bg-card">
      <div className="flex items-baseline justify-between px-[18px] pt-4 pb-[11px]">
        <h2 className="text-[12px] font-semibold text-ink m-0">Committees</h2>
        <span className="text-[8.25px] uppercase tracking-[0.03em] text-ink3 tnum">
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
            <span className="text-[10.5px] text-ink leading-snug">{c.name}</span>
            {/* Chair is a role, not a party signal, so it reads as a filled navy chip -- the
                site's own emphasis color, never a hue with party meaning. */}
            <span
              className={`flex-none text-[7.5px] uppercase tracking-[0.05em] rounded-chip px-1.5 py-0.5 mt-px border ${
                chair ? 'text-white bg-navy border-navy' : 'text-ink3 bg-card border-rule'
              }`}
            >
              {c.role}
            </span>
          </div>
        );
      })}
      {committees.length === 0 && (
        <p className="text-sm text-ink4 px-[18px] pb-4 m-0">No assignments recorded.</p>
      )}
      {hidden > 0 && (
        <div className="px-[18px] py-3 border-t border-rule">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="text-[9px] uppercase tracking-[0.05em] font-semibold text-ink underline decoration-[#7F92C4] underline-offset-4"
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
      <h2 className="text-[12px] font-semibold text-ink m-0 mb-3.5">Key dates</h2>
      <div className="flex flex-col">
        {dates.map((d) => (
          <div key={`${d.date} ${d.label}`} className="flex gap-3">
            <div className="flex flex-col items-center flex-none w-2.5">
              <span className="w-2 h-2 rounded-full border-2 border-ink3 bg-card mt-1" />
              <span className="w-px flex-1 bg-rule" />
            </div>
            <div className="pb-4 flex flex-col gap-0.5">
              <div className="text-[8.25px] uppercase tracking-[0.03em] text-ink3 tnum">
                {d.date}
              </div>
              <div className="text-[10.5px] text-ink leading-snug">{d.label}</div>
            </div>
          </div>
        ))}
        {dates.length === 0 && <p className="text-sm text-ink4 m-0">No dates recorded.</p>}
      </div>
    </section>
  );
}

export function NextElectionCard({ election }: { election: ElectionModel | null }) {
  const row = (label: string, value: string | null) => (
    <div className="flex justify-between gap-3 text-[9.75px] border-t border-rule pt-2.5">
      <span className="text-ink2">{label}</span>
      <span className={value ? 'text-ink3' : 'text-ink4'}>{value || 'Not yet available'}</span>
    </div>
  );
  return (
    <section className="border border-rule rounded-card bg-card px-[18px] pt-4 pb-[18px]">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-[12px] font-semibold text-ink m-0">Next election</h2>
        {election && election.daysAway >= 0 && (
          <span className="text-[8.25px] uppercase tracking-[0.03em] text-ink3 tnum">
            {election.daysAway} days away
          </span>
        )}
      </div>
      {election ? (
        <>
          <div className="text-[19.5px] font-semibold text-ink tnum -tracking-[0.01em]">
            {election.date}
          </div>
          <div className="text-[9.75px] text-ink2 mt-0.5">
            {election.kind}
            {election.daysAway < 0 && ` · ${-election.daysAway} days ago`}
          </div>
          {election.onBallot && (
            <div className="mt-3 inline-flex items-center text-[7.5px] uppercase tracking-[0.08em] font-semibold text-white bg-navy rounded-chip px-2 py-[5px]">
              On the ballot
            </div>
          )}
        </>
      ) : (
        <div className="text-sm text-ink4">Not yet available</div>
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

export interface LockedPanel {
  title: string;
  desc: string;
}

/* Locked panels are sized as they will be when live, so the page does not reflow on release;
   a released panel (`live`) takes the leading cells of the same grid. */
export function LockedPanels({ panels, live }: { panels: LockedPanel[]; live?: ReactNode }) {
  const pending = panels.length;
  return (
    <section className="px-7 pt-1 pb-7">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <h2 className="text-[13.5px] font-semibold text-ink m-0">
          {live ? 'Data panels' : 'Planned data panels'}
        </h2>
        <span className="text-[8.25px] uppercase tracking-[0.03em] text-ink3">
          {live ? `${pending} not yet published` : 'Not yet published'}
        </span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {live}
        {panels.map((p) => (
          <div
            key={p.title}
            className="border border-dashed border-lockRule rounded-card bg-lockBg p-4 min-h-[150px] flex flex-col justify-between gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-[7px]">
                <LockGlyph />
                <span className="text-[11.25px] text-ink2">{p.title}</span>
              </div>
              <p className="text-[9.75px] text-ink3 leading-relaxed m-0">{p.desc}</p>
            </div>
            <div className="text-[7.5px] uppercase tracking-[0.05em] text-ink3">
              Coming in a future release
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
