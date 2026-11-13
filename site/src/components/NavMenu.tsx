'use client';

// A header dropdown: a button that opens a short list of links. Closes on a second click, on a
// click anywhere else, and on Escape (focus goes back to the button).
import { useEffect, useRef, useState } from 'react';

export interface NavLink {
  label: string;
  href: string;
  /** Marks a page that is only a placeholder so far. */
  soon?: boolean;
}

export function NavMenu({
  label,
  links,
  active = false,
  alignRight = false,
}: {
  label: string;
  links: NavLink[];
  active?: boolean;
  /** Open the list from the button's right edge, for the last menu in the row. */
  alignRight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-0.5 md:gap-1 px-1.5 md:px-3 py-2.5 bg-transparent border-0 border-b-2 cursor-pointer text-[14px] md:text-[15px] ${
          active ? 'font-semibold text-ink border-navy' : 'text-ink2 border-transparent hover:text-ink'
        }`}
      >
        {label}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={open ? 'rotate-180' : ''}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul className={`absolute ${alignRight ? 'right-0' : 'left-0'} top-full z-40 m-0 list-none min-w-[210px] p-1.5 bg-card border border-rule rounded-card shadow-[0_8px_24px_rgba(26,26,25,0.08)]`}>
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-ctl text-[15px] text-ink hover:bg-canvas"
              >
                {l.label}
                {l.soon && (
                  <span className="text-micro font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-chip bg-lockBg text-ink2">
                    Soon
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
