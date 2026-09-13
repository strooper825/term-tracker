export default function NextElectionCard({ election }) {
  const row = (label, value) => (
    <div className="flex justify-between gap-3 text-sm border-t border-ruleSoft pt-2.5">
      <span className="text-ink2">{label}</span>
      <span className={value ? 'text-ink' : 'text-ink4'}>{value || 'Not yet available'}</span>
    </div>
  );
  return (
    <section className="border border-rule rounded-card bg-card px-[18px] pt-4 pb-[18px]">
      <h2 className="text-[13px] font-semibold m-0 mb-3">Next election</h2>
      <div className="text-[22px] font-semibold tnum -tracking-[0.015em]">{election.date}</div>
      <div className="text-sm text-ink3 mt-0.5">{election.kind} · {election.daysAway} days away</div>
      <div className="mt-3 inline-flex items-center text-[11px] uppercase tracking-[0.06em] bg-[#F2F0EA] border border-rule rounded-chip px-2 py-1">
        On the ballot
      </div>
      <div className="mt-4 flex flex-col gap-2.5">
        {row('Opponent', election.opponent)}
        {row('Race rating', election.rating)}
      </div>
    </section>
  );
}
