// MemberHeader, StatStrip, TermProgress: ported from design/src/components.
import type { MemberHeaderModel, Stat, TermModel } from '@/lib/model';
import { formatNumber } from '@/lib/format';
import { PartyBadge } from './SiteChrome';

export function MemberHeader({ member }: { member: MemberHeaderModel }) {
  return (
    <div className="flex items-start gap-[18px] flex-wrap">
      {member.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.photoUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="w-[76px] h-[76px] rounded-full object-cover border border-[#D3D0C9] flex-none bg-[#DEDCD6]"
        />
      ) : (
        <div className="w-[76px] h-[76px] rounded-full bg-[#DEDCD6] border border-[#D3D0C9] flex-none" />
      )}
      <div className="flex flex-col gap-[7px] min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-name font-semibold m-0">{member.name}</h1>
          <PartyBadge party={member.party} />
        </div>
        <div className="text-base text-ink2 flex gap-2 flex-wrap">
          <span>{member.seat}</span>
          <span className="text-[#C6C3BC]">|</span>
          <span>{member.chamberLabel}</span>
          <span className="text-[#C6C3BC]">|</span>
          <span>{member.congress}</span>
        </div>
        <div className="text-sm text-ink3 tnum">{member.termLine}</div>
      </div>
    </div>
  );
}

/* Five stats: attendance, party unity, sponsored, cosponsored, committees. 3x2 at mobile,
   5-up at desktop. Labels are height-locked so values share a baseline. */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-3 lg:grid-cols-5 border border-rule rounded-card overflow-hidden bg-card">
      {stats.map((s) => (
        <div
          key={s.label}
          className="px-4 py-3.5 border-r border-b border-ruleSoft flex flex-col gap-[5px]"
        >
          <div className="text-label uppercase text-ink3 leading-tight min-h-[26px]">{s.label}</div>
          <div className="text-stat font-semibold tnum">{s.value}</div>
          <div className="text-meta text-ink3 tnum">{s.note}</div>
        </div>
      ))}
    </div>
  );
}

export function TermProgress({ term }: { term: TermModel }) {
  const pct = term.total > 0 ? Math.min(100, (term.elapsed / term.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-[7px]">
      <div className="flex justify-between text-meta text-ink3 tnum">
        <span>
          Term progress · {formatNumber(term.elapsed)} of {formatNumber(term.total)} days elapsed
        </span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-[#EDEBE6] rounded-[3px] overflow-hidden">
        <div className="h-full bg-ink2" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-ink4 tnum">
        <span>{term.start}</span>
        <span>{term.end}</span>
      </div>
    </div>
  );
}
