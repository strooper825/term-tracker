/* Five stats: attendance, party unity, sponsored, cosponsored, committees.
   3×2 at mobile, 5-up at desktop. Labels are height-locked so values share a baseline. */
export default function StatStrip({ stats }) {
  return (
    <div className="grid grid-cols-3 lg:grid-cols-5 border border-rule rounded-card overflow-hidden bg-card">
      {stats.map(s => (
        <div key={s.label} className="px-4 py-3.5 border-r border-b border-ruleSoft flex flex-col gap-[5px]">
          <div className="text-label uppercase text-ink3 leading-tight min-h-[26px]">{s.label}</div>
          <div className="text-stat font-semibold tnum">{s.value}</div>
          <div className="text-meta text-ink3 tnum">{s.note}</div>
        </div>
      ))}
    </div>
  );
}
