// Ported from design/src/components/FilterChip.jsx.
/* Zero-count chips render greyed and non-interactive so a click cannot empty the results. */
export function FilterChip({
  label,
  count,
  color,
  on,
  onToggle,
}: {
  label: string;
  count: number;
  color?: string;
  on: boolean;
  onToggle: () => void;
}) {
  const empty = count === 0;
  const fg = empty ? '#C6C3BC' : on ? '#555C62' : '#A6A39C';
  return (
    <button
      type="button"
      disabled={empty}
      onClick={onToggle}
      aria-pressed={on}
      className="flex-none inline-flex items-center gap-[7px] text-[9px] whitespace-nowrap rounded-ctl px-[10px] py-[6px] border disabled:cursor-default hover:enabled:border-ink"
      style={{
        color: fg,
        background: empty ? '#FAFAFB' : '#FFFFFF',
        borderColor: empty ? '#EFEDE8' : '#E0E3E6',
      }}
    >
      {color && (
        <i
          className="w-[7px] h-[7px] rounded-[1px] flex-none"
          style={{ background: empty ? '#E0DDD7' : on ? color : '#C6C3BC' }}
        />
      )}
      <span>{label}</span>
      <span className="tnum" style={{ color: empty ? '#D3D0C9' : '#676E75' }}>
        {count.toLocaleString('en-US')}
      </span>
    </button>
  );
}
