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
          className="w-16 h-16 rounded-full object-cover border border-rule flex-none bg-[#DEDCD6]"
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-[#DEDCD6] border border-rule flex-none" />
      )}
      <div className="flex flex-col gap-[7px] min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[25.5px] font-semibold text-ink m-0">{member.name}</h1>
          <PartyBadge party={member.party} />
          {member.caucusNote && <span className="text-meta text-ink3">{member.caucusNote}</span>}
          {member.leadershipTitle && (
            <span className="text-[7.5px] uppercase tracking-[0.08em] text-ink3 border border-rule rounded-chip px-[7px] py-[5px] whitespace-nowrap">
              {member.leadershipTitle}
            </span>
          )}
        </div>
        <div className="text-[10.5px] text-ink2 flex gap-2 flex-wrap">
          <span className="text-ink">{member.seat}</span>
          <span className="text-[#C6C3BC]">|</span>
          <span>{member.chamberLabel}</span>
          <span className="text-[#C6C3BC]">|</span>
          <span>{member.congress}</span>
        </div>
        <div className="text-[8.25px] uppercase tracking-[0.03em] text-ink3 tnum">
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
        <div key={s.label} className="px-4 py-3.5 border-r border-b lg:border-b-0 border-rule flex flex-col gap-[5px]">
          <div className="text-[7.5px] uppercase tracking-[0.22em] text-ink3 leading-tight min-h-[18px]">
            {s.label}
          </div>
          <div className="text-[15px] font-semibold text-ink tnum">{s.value}</div>
          <div className="text-[8.25px] text-ink3 tnum leading-snug">{s.note}</div>
        </div>
      ))}
    </div>
  );
}

export function TermProgress({ term }: { term: TermModel }) {
  const pct = term.total > 0 ? Math.min(100, (term.elapsed / term.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-[7px]">
      <div className="flex justify-between text-[8.25px] uppercase tracking-[0.03em] text-ink3 tnum">
        <span>
          Term progress · {formatNumber(term.elapsed)} of {formatNumber(term.total)} days elapsed
        </span>
        <span className="text-ink normal-case">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-[7px] bg-[#ECEEF3] rounded-[3px] overflow-hidden">
        <div className="h-full bg-navy" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[8.25px] text-ink3 tnum">
        <span>{term.start}</span>
        <span>{term.end}</span>
      </div>
    </div>
  );
}
