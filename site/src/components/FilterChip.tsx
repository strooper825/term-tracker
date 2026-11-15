// A filter that is on or off, with how many rows it covers. One style for every list on the
// site (the votes list, the members index, the browse page's stage buttons).
/* A zero-count chip is greyed and cannot be pressed, so a click cannot empty the results. */
export function FilterChip({
  label,
  count,
  color,
  on,
  onToggle,
}: {
  label: string;
  count: number;
  /** A small square of this colour before the label, for a party or a vote position. */
  color?: string;
  on: boolean;
  onToggle: () => void;
}) {
  const empty = count === 0;
  return (
    <button
      type="button"
      disabled={empty}
      onClick={onToggle}
      aria-pressed={on}
      className={`flex-none inline-flex items-center gap-2 min-h-[44px] px-3 rounded-ctl border-2 text-[14px] whitespace-nowrap disabled:cursor-default ${
        empty
          ? 'border-ruleSoft bg-card text-ink2 opacity-60'
          : on
            ? 'border-navy bg-lockBg text-ink font-semibold cursor-pointer'
            : 'border-rule bg-card text-ink cursor-pointer hover:border-ink3'
      }`}
    >
      {color && <i className="w-2 h-2 rounded-[1px] flex-none" style={{ background: empty ? '#C6C3BC' : color }} />}
      <span>{label}</span>
      <span className="text-meta font-normal text-ink2 tnum">{count.toLocaleString('en-US')}</span>
    </button>
  );
}
