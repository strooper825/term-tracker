// MemberHeader, StatStrip, TermProgress: ported from design/src/components.
import type { MemberHeaderModel, Stat, TermModel } from '@/lib/model';
import { formatNumber } from '@/lib/format';
import { MemberPhoto } from './MemberPhoto';
import { PartyBadge } from './SiteChrome';

export function MemberHeader({ member }: { member: MemberHeaderModel }) {
  return (
    <div className="flex items-start gap-[18px] flex-wrap">
      <MemberPhoto
        photoUrl={member.photoUrl}
        bioguideId={member.bioguideId}
        className="w-16 h-16 rounded-full"
      />
      <div className="flex flex-col gap-[7px] min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-title font-semibold text-ink m-0">{member.name}</h1>
          <PartyBadge party={member.party} />
          {member.caucusNote && <span className="text-meta text-ink2">{member.caucusNote}</span>}
          {member.leadershipTitle && (
            <span className="text-label uppercase text-ink2 border border-rule rounded-chip px-2 py-[5px] whitespace-nowrap">
              {member.leadershipTitle}
            </span>
          )}
        </div>
        <div className="text-body text-ink2 flex gap-2 flex-wrap">
          <span className="text-ink font-medium">{member.seat}</span>
          <span className="text-[#C6C3BC]">|</span>
          <span>{member.chamberLabel}</span>
          <span className="text-[#C6C3BC]">|</span>
          <span>{member.congress}</span>
        </div>
        <div className="text-meta text-ink3 tnum">
          {member.termLine} · {member.serviceLine}
        </div>
      </div>
    </div>
  );
}

/* Five stats: attendance, party unity, sponsored, cosponsored, committees. 3x2 at mobile,
   5-up at desktop, one row with vertical dividers between columns (not a grid of boxes). */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-3 lg:grid-cols-5 border border-rule rounded-card overflow-hidden bg-card">
      {stats.map((s) => (
        <div key={s.label} className="px-4 py-4 border-r border-b lg:border-b-0 border-rule flex flex-col gap-1.5">
          <div className="text-label uppercase text-ink2 leading-tight min-h-[16px]">{s.label}</div>
          <div className="text-stat font-semibold text-ink tnum leading-none">{s.value}</div>
          <div className="text-meta text-ink3 tnum leading-snug">{s.note}</div>
        </div>
      ))}
    </div>
  );
}

export function TermProgress({ term }: { term: TermModel }) {
  const pct = term.total > 0 ? Math.min(100, (term.elapsed / term.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-[7px]">
      <div className="flex justify-between items-baseline text-meta text-ink3 tnum">
        <span>
          Term progress · {formatNumber(term.elapsed)} of {formatNumber(term.total)} days elapsed
        </span>
        <span className="text-body font-semibold text-ink">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-[#ECEEF3] rounded-[3px] overflow-hidden">
        <div className="h-full bg-navy" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-micro text-ink3 tnum">
        <span>{term.start}</span>
        <span>{term.end}</span>
      </div>
    </div>
  );
}
