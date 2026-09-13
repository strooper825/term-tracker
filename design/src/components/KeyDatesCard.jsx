export default function KeyDatesCard({ dates }) {
  return (
    <section className="border border-rule rounded-card bg-card px-[18px] pt-4 pb-[18px]">
      <h2 className="text-[13px] font-semibold m-0 mb-3.5">Key dates</h2>
      <div className="flex flex-col">
        {dates.map(d => (
          <div key={d.date} className="flex gap-3">
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
      </div>
    </section>
  );
}
