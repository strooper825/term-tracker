// CommitteesCard, KeyDatesCard, NextElectionCard, LockedPanels: ported from design/src/components.
import type { ReactNode } from 'react';
import type { CommitteeRow, ElectionModel, KeyDateRow } from '@/lib/model';
import { SourceLink } from './SiteChrome';

export function CommitteesCard({ committees }: { committees: CommitteeRow[] }) {
  return (
    <section className="border border-rule rounded-card bg-card">
      <div className="flex items-baseline justify-between px-[18px] pt-4 pb-[11px]">
        <h2 className="text-[13px] font-semibold m-0">Committees</h2>
        <span className="text-meta text-ink3 tnum">{committees.length}</span>
      </div>
      {committees.map((c) => {
        const chair = c.role === 'Chair'; // subcommittee chairs keep the neutral badge
        return (
          <div
            key={c.name}
            className="flex justify-between items-start gap-2.5 px-[18px] py-2.5 border-t border-[#F4F2ED]"
          >
            <span className="text-sm leading-snug">{c.name}</span>
            <span
              className="flex-none text-label uppercase rounded-chip px-1.5 py-0.5 mt-px border"
              style={
                chair
                  ? { color: '#8A2F2E', background: '#FBF0EF', borderColor: '#F0DBDA' }
                  : { color: '#57564F', background: '#F6F5F2', borderColor: '#E6E4DF' }
              }
            >
              {c.role}
            </span>
          </div>
        );
      })}
      {committees.length === 0 && (
        <p className="text-sm text-ink4 px-[18px] pb-4 m-0">No assignments recorded.</p>
      )}
    </section>
  );
}

export function KeyDatesCard({ dates }: { dates: KeyDateRow[] }) {
  return (
    <section className="border border-rule rounded-card bg-card px-[18px] pt-4 pb-[18px]">
      <h2 className="text-[13px] font-semibold m-0 mb-3.5">Key dates</h2>
      <div className="flex flex-col">
        {dates.map((d) => (
          <div key={`${d.date} ${d.label}`} className="flex gap-3">
            <div className="flex flex-col items-center flex-none w-2.5">
              <span className="w-2 h-2 rounded-full border-2 border-ink2 bg-card mt-1" />
              <span className="w-px flex-1 bg-rule" />
            </div>
            <div className="pb-4 flex flex-col gap-0.5">
              <div className="text-sm font-semibold tnum">{d.date}</div>
              <div className="text-sm text-ink3 leading-snug">{d.label}</div>
            </div>
          </div>
        ))}
        {dates.length === 0 && <p className="text-sm text-ink4 m-0">No dates recorded.</p>}
      </div>
    </section>
  );
}

export function NextElectionCard({ election }: { election: ElectionModel | null }) {
  const row = (label: string, value: string | null, sourceUrl: string | null = null) => (
    <div className="flex justify-between items-start gap-3 text-sm border-t border-ruleSoft pt-2.5">
      <span className="flex-none text-ink2">{label}</span>
      <span className="flex items-start justify-end gap-1.5 text-right min-w-0">
        <span className={value ? 'text-ink' : 'text-ink4'}>{value || 'Not yet available'}</span>
        {value && sourceUrl && <SourceLink href={sourceUrl} />}
      </span>
    </div>
  );
  return (
    <section className="border border-rule rounded-card bg-card px-[18px] pt-4 pb-[18px]">
      <h2 className="text-[13px] font-semibold m-0 mb-3">Next election</h2>
      {election ? (
        <>
          <div className="text-[22px] font-semibold tnum -tracking-[0.015em]">{election.date}</div>
          <div className="text-sm text-ink3 mt-0.5">{election.subtitle}</div>
          {election.raceNote && <div className="text-sm text-ink3">{election.raceNote}</div>}
          {election.onBallot && (
            <div className="mt-3 inline-flex items-center text-[11px] uppercase tracking-[0.06em] bg-[#F2F0EA] border border-rule rounded-chip px-2 py-1">
              On the ballot
            </div>
          )}
        </>
      ) : (
        <div className="text-sm text-ink4">Not yet available</div>
      )}
      <div className="mt-4 flex flex-col gap-2.5">
        {row('Opponent', election?.opponent ?? null, election?.opponentSourceUrl ?? null)}
        {row('Prior result', election?.prior ?? null, election?.priorSourceUrl ?? null)}
        {row('Race rating', election?.rating ?? null)}
      </div>
    </section>
  );
}

const LockGlyph = () => (
  <span className="relative inline-block w-[13px] h-[13px] border-[1.5px] border-lockInk rounded-[2px]">
    <span className="absolute left-[2.5px] -top-[5px] w-1.5 h-1.5 border-[1.5px] border-b-0 border-lockInk rounded-t-[3px]" />
  </span>
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
        <h2 className="text-[13px] font-semibold text-ink2 m-0">
          {live ? 'Data panels' : 'Planned data panels'}
        </h2>
        <span className="text-meta text-ink4">
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
                <span className="text-sm font-semibold text-ink3">{p.title}</span>
              </div>
              <p className="text-meta text-ink4 leading-relaxed m-0">{p.desc}</p>
            </div>
            <div className="text-[11px] uppercase tracking-[0.05em] text-lockInk">
              Coming in a future release
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
