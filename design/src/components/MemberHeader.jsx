import PartyBadge from './PartyBadge';

export default function MemberHeader({ member, photoUrl }) {
  return (
    <div className="flex items-start gap-[18px] flex-wrap">
      {photoUrl
        ? <img src={photoUrl} alt="" className="w-[76px] h-[76px] rounded-full object-cover border border-[#D3D0C9] flex-none" />
        : <div className="w-[76px] h-[76px] rounded-full bg-[#DEDCD6] border border-[#D3D0C9] flex-none" />}
      <div className="flex flex-col gap-[7px] min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-name font-semibold m-0">{member.name}</h1>
          <PartyBadge party={member.party} />
        </div>
        <div className="text-base text-ink2 flex gap-2 flex-wrap">
          <span>{member.seat}</span><span className="text-[#C6C3BC]">|</span>
          <span>{member.chamberLabel}</span><span className="text-[#C6C3BC]">|</span>
          <span>{member.congress}</span>
        </div>
        <div className="text-sm text-ink3 tnum">{member.termLine}</div>
      </div>
    </div>
  );
}
