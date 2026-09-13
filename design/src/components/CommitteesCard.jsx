export default function CommitteesCard({ committees }) {
  return (
    <section className="border border-rule rounded-card bg-card">
      <div className="flex items-baseline justify-between px-[18px] pt-4 pb-[11px]">
        <h2 className="text-[13px] font-semibold m-0">Committees</h2>
        <span className="text-meta text-ink3 tnum">{committees.length}</span>
      </div>
      {committees.map(c => {
        const chair = c.role === 'Chair';
        return (
          <div key={c.name} className="flex justify-between items-start gap-2.5 px-[18px] py-2.5 border-t border-[#F4F2ED]">
            <span className="text-sm leading-snug">{c.name}</span>
            <span className="flex-none text-label uppercase rounded-chip px-1.5 py-0.5 mt-px border"
              style={chair
                ? { color: '#8A2F2E', background: '#FBF0EF', borderColor: '#F0DBDA' }
                : { color: '#57564F', background: '#F6F5F2', borderColor: '#E6E4DF' }}>
              {c.role}
            </span>
          </div>
        );
      })}
    </section>
  );
}
