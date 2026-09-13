const LockGlyph = () => (
  <span className="relative inline-block w-[13px] h-[13px] border-[1.5px] border-lockInk rounded-[2px]">
    <span className="absolute left-[2.5px] -top-[5px] w-1.5 h-1.5 border-[1.5px] border-b-0 border-lockInk rounded-t-[3px]" />
  </span>
);

/* Sized as they will be when live, so the page doesn't reflow on release. */
export default function LockedPanels({ panels }) {
  return (
    <section className="px-7 pt-1 pb-7">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <h2 className="text-[13px] font-semibold text-ink2 m-0">Planned data panels</h2>
        <span className="text-meta text-ink4">Not yet published</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {panels.map(p => (
          <div key={p.title} className="border border-dashed border-lockRule rounded-card bg-lockBg p-4 min-h-[150px] flex flex-col justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-[7px]">
                <LockGlyph />
                <span className="text-sm font-semibold text-ink3">{p.title}</span>
              </div>
              <p className="text-meta text-ink4 leading-relaxed m-0">{p.desc}</p>
            </div>
            <div className="text-[11px] uppercase tracking-[0.05em] text-lockInk">Coming in a future release</div>
          </div>
        ))}
      </div>
    </section>
  );
}
