'use client';

// Tabs for the member dashboard. Every panel is rendered on the server and passed in as a
// node, so all of it is in the static HTML; this only decides which one is visible. The
// selected tab lives in the URL hash (#election) so a tab can be linked to, and each tab is
// its own component, so a tab can grow without touching the others.
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';

export interface TabSpec {
  id: string;
  label: string;
  /** Not published yet: the tab is still selectable, and says so. */
  locked?: boolean;
  content: ReactNode;
}

export function MemberTabs({ tabs }: { tabs: TabSpec[] }) {
  const [active, setActive] = useState(tabs[0].id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Open the tab named in the hash after hydration; the server render always starts on the first.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (tabs.some((t) => t.id === id)) setActive(id);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [tabs]);

  const select = (id: string, focus = false) => {
    setActive(id);
    window.history.replaceState(null, '', `#${id}`);
    if (focus) refs.current[id]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    select(tabs[next].id, true);
  };

  return (
    <div className="flex flex-col">
      <div
        role="tablist"
        aria-label="Member dashboard sections"
        className="flex gap-1 overflow-x-auto border-y border-rule px-7 bg-sheet"
      >
        {tabs.map((t, i) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              role="tab"
              type="button"
              id={`tab-${t.id}`}
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => select(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`flex-none flex items-center gap-2 px-4 py-3.5 text-base whitespace-nowrap border-b-2 -mb-px ${
                on
                  ? 'border-navy text-ink font-semibold'
                  : 'border-transparent text-ink2 hover:text-ink hover:border-rule'
              }`}
            >
              {t.label}
              {t.locked && (
                <span className="text-micro uppercase text-lockInk bg-lockBg border border-lockRule rounded-chip px-1.5 py-0.5">
                  Soon
                </span>
              )}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={t.id !== active}
          className="px-7 py-7"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
