import PartyBadge from './PartyBadge';

/* Whole card is the link to the member's term dashboard. */
export default function MemberCard({ member }) {
  const stats = [
    { value: member.attendance.toFixed(2) + '%', label: 'Attendance' },
    { value: String(member.sponsored), label: 'Sponsored' },
    { value: member.unity.toFixed(2) + '%', label: 'Party unity' }
  ];
  return (
    <a href={`/members/${member.bioguideId}`}
       className="flex flex-col gap-3 border border-rule rounded-card bg-card p-4 text-ink no-underline hover:border-lockInk hover:bg-[#FCFBF9]">
      <div className="flex items-start gap-3">
        <div className="w-[46px] h-[46px] rounded-full bg-[#DEDCD6] border border-[#D3D0C9] flex-none" />
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold">{member.name}</span>
            <PartyBadge party={member.party} size="sm" />
          </div>
          <span className="text-sm text-ink3">{member.seatShort}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 border-t border-ruleSoft pt-[11px]">
        {stats.map(s => (
          <div key={s.label} className="flex flex-col gap-0.5">
            <span className="text-base font-semibold tnum">{s.value}</span>
            <span className="text-[10px] uppercase tracking-[0.06em] text-ink4 leading-tight">{s.label}</span>
          </div>
        ))}
      </div>
    </a>
  );
}
