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
  const fg = empty ? '#C6C3BC' : on ? '#1A1A19' : '#A6A39C';
  return (
    <button
      type="button"
      disabled={empty}
      onClick={onToggle}
      aria-pressed={on}
      className="flex-none inline-flex items-center gap-1.5 text-meta whitespace-nowrap rounded-full px-2.5 py-1 border disabled:cursor-default"
      style={{
        color: fg,
        background: empty ? '#FAF9F6' : on ? '#FFFFFF' : '#F6F5F2',
        borderColor: empty ? '#EFEDE8' : on ? (color ? color + '55' : '#B4B1A9') : '#E6E4DF',
      }}
    >
      {color && (
        <i
          className="w-[7px] h-[7px] rounded-full flex-none"
          style={{ background: empty ? '#E0DDD7' : on ? color : '#C6C3BC' }}
        />
      )}
      <span>{label}</span>
      <span className="tnum" style={{ color: empty ? '#D3D0C9' : on ? '#8A877F' : '#C6C3BC' }}>
        {count.toLocaleString('en-US')}
      </span>
    </button>
  );
}
