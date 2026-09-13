export default function TermProgress({ term }) {
  const pct = (term.elapsed / term.total) * 100;
  const nf = n => n.toLocaleString('en-US');
  return (
    <div className="flex flex-col gap-[7px]">
      <div className="flex justify-between text-meta text-ink3 tnum">
        <span>Term progress · {nf(term.elapsed)} of {nf(term.total)} days elapsed</span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-[#EDEBE6] rounded-[3px] overflow-hidden">
        <div className="h-full bg-ink2" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-ink4 tnum">
        <span>{term.start}</span><span>{term.end}</span>
      </div>
    </div>
  );
}
