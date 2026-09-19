'use client';

// Multi-select for policy area. Congress.gov uses about 33 of them, too many for a chip row,
// so this is a disclosure listing only the areas present in the member's feed with their
// counts, commonest first. Counts and areas both come from mart.member_feed.policy_area.
import { useEffect, useRef } from 'react';
import type { PolicyAreaCount } from '@/lib/model';

export function PolicyAreaSelect({
  areas,
  selected,
  onToggle,
  onClear,
  open,
  onOpenChange,
}: {
  areas: PolicyAreaCount[];
  selected: Set<string>;
  onToggle: (name: string) => void;
  onClear: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape, the way a native select would.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  if (areas.length === 0) return null;

  const label =
    selected.size === 0
      ? 'All policy areas'
      : selected.size === 1
        ? [...selected][0]
        : `${selected.size} policy areas`;

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => onOpenChange(!open)}
        className={`flex items-center gap-1.5 text-body border rounded-ctl px-2.5 py-[7px] max-w-[220px] ${
          selected.size > 0 ? 'border-ink3 bg-[#F2F0EA]' : 'border-[#D9D6CF] bg-card'
        }`}
      >
        <span className="truncate">{label}</span>
        <span aria-hidden="true" className="text-ink4 flex-none">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Policy areas"
          aria-multiselectable="true"
          className="absolute z-20 mt-1 w-[280px] max-h-[320px] overflow-y-auto bg-card border border-rule rounded-card shadow-[0_6px_20px_rgba(26,26,25,0.10)] py-1"
        >
          {selected.size > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="w-full text-left text-meta text-[#1F4E9C] px-3 py-1.5 hover:bg-canvas"
            >
              Clear policy areas
            </button>
          )}
          {areas.map((area) => {
            const on = selected.has(area.name);
            return (
              <button
                key={area.name}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => onToggle(area.name)}
                className="w-full flex items-baseline justify-between gap-3 text-left text-body px-3 py-1.5 hover:bg-canvas"
              >
                <span className="flex items-baseline gap-2 min-w-0">
                  <span
                    aria-hidden="true"
                    className={`flex-none w-3 h-3 rounded-[2px] border translate-y-px ${
                      on ? 'bg-ink2 border-ink2' : 'border-[#D9D6CF]'
                    }`}
                  />
                  <span className="leading-snug">{area.name}</span>
                </span>
                <span className="flex-none text-meta text-ink3 tnum">{area.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
