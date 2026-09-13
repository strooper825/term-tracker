// SiteHeader, SiteFooter, Breadcrumb, PartyBadge, SourceLink: ported from design/src/components.
import { PARTY_COLOR, type PartyName } from '@/data/eventTypes';

export const REPO_URL = 'https://github.com/strooper825/term-tracker';

export function SiteHeader({ active }: { active: string }) {
  const link = (href: string, label: string) => (
    <a
      key={label}
      href={href}
      className={active === label ? 'text-ink font-semibold' : 'text-ink2 hover:text-ink'}
    >
      {label}
    </a>
  );
  return (
    <header className="flex items-center justify-between gap-6 px-7 py-3.5 border-b border-rule">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-bold uppercase tracking-[0.14em]">Term Tracker</span>
        <span className="text-[10px] uppercase tracking-[0.08em] text-ink4 border border-rule rounded-chip px-1.5 py-px">
          working name
        </span>
      </div>
      <nav className="flex gap-[22px] text-sm">
        {link('/members', 'Members')}
        {link(`${REPO_URL}/blob/main/docs/PLAN.md`, 'About')}
        {link(`${REPO_URL}/blob/main/docs/data-dictionary.md`, 'Data')}
      </nav>
    </header>
  );
}

export function SiteFooter({ lastUpdated }: { lastUpdated: string | null }) {
  return (
    <footer className="border-t border-rule px-7 pt-5 pb-7 flex flex-col gap-1.5">
      <p className="text-meta text-ink3 m-0">
        Data from Congress.gov, Senate.gov, the FEC, and the unitedstates/congress-legislators
        project.
        {lastUpdated ? ` Last updated ${lastUpdated}.` : ' Last update time not recorded.'}
      </p>
      <a href={`${REPO_URL}/blob/main/docs/data-dictionary.md`} className="text-meta">
        Data dictionary ↗
      </a>
    </footer>
  );
}

export function Breadcrumb({ name }: { name: string }) {
  return (
    <nav className="flex items-center gap-[7px] text-meta text-ink3">
      <a href="/members" className="text-ink2">
        Members
      </a>
      <span className="text-[#C6C3BC]">/</span>
      <span>{name}</span>
    </nav>
  );
}

/* Always renders the party WORD, never color alone. */
export function PartyBadge({ party, size = 'md' }: { party: PartyName; size?: 'sm' | 'md' }) {
  const cls =
    size === 'sm' ? 'text-[9px] px-1.5 tracking-[0.05em]' : 'text-[11px] px-[7px] tracking-[0.06em]';
  return (
    <span
      className={`${cls} py-0.5 font-semibold text-white rounded-chip whitespace-nowrap`}
      style={{ background: PARTY_COLOR[party] }}
    >
      {party.toUpperCase()}
    </span>
  );
}

export function SourceLink({
  href,
  title = 'View source record',
}: {
  href: string;
  title?: string;
}) {
  return (
    <a
      href={href}
      title={title}
      target="_blank"
      rel="noopener noreferrer"
      className="flex-none text-meta text-ink3 border border-rule rounded-chip px-1.5 py-0.5"
    >
      source ↗
    </a>
  );
}
