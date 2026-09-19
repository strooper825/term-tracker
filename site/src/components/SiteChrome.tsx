// SiteHeader, SiteFooter, Breadcrumb, PartyBadge, SourceLink: ported from design/src/components.
import { PARTY_COLOR, type PartyName } from '@/data/eventTypes';

export const REPO_URL = 'https://github.com/strooper825/term-tracker';

/* Anything off this site opens in a new tab, so a reader never loses their place. */
const isExternal = (href: string) => /^https?:\/\//.test(href);
const newTab = (href: string) =>
  isExternal(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {};

export function SiteHeader({ active }: { active: string }) {
  const link = (href: string, label: string) => (
    <a
      key={label}
      href={href}
      {...newTab(href)}
      className={active === label ? 'text-ink font-semibold' : 'text-ink2 hover:text-ink'}
    >
      {label}
      {isExternal(href) && <span className="sr-only"> (opens in a new tab)</span>}
    </a>
  );
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-7 py-3.5 border-b border-rule">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#33477A]">
          Term Tracker
        </span>
        <span className="text-label uppercase text-ink4 border border-rule rounded-chip px-1.5 py-px">
          working name
        </span>
      </div>
      <nav className="flex gap-[22px] text-body">
        {link('/congress', 'Congress')}
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
      <a
        href={`${REPO_URL}/blob/main/docs/data-dictionary.md`}
        {...newTab(REPO_URL)}
        className="text-label uppercase text-ink3"
      >
        Data dictionary ↗<span className="sr-only"> (opens in a new tab)</span>
      </a>
    </footer>
  );
}

export interface Crumb {
  label: string;
  href: string;
}

const MEMBERS_ROOT: Crumb[] = [{ label: 'Members', href: '/members' }];

export function Breadcrumb({ name, trail = MEMBERS_ROOT }: { name: string; trail?: Crumb[] }) {
  return (
    <nav className="flex items-center gap-[7px] text-meta text-ink3 flex-wrap">
      {trail.map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-[7px]">
          <a href={crumb.href} className="text-ink2">
            {crumb.label}
          </a>
          <span className="text-[#C6C3BC]">/</span>
        </span>
      ))}
      <span>{name}</span>
    </nav>
  );
}

/* Always renders the party WORD, never color alone. */
export function PartyBadge({
  party,
  size = 'md',
}: {
  party: PartyName;
  size?: 'sm' | 'md' | 'lg';
}) {
  const cls = {
    sm: 'text-label px-1.5 py-0.5',
    md: 'text-label px-[7px] py-0.5',
    // The member card's own-row badge (Members index): bigger padding, not just bigger text.
    lg: 'text-label px-[7px] py-[5px]',
  }[size];
  return (
    <span
      className={`${cls} font-semibold text-white rounded-chip whitespace-nowrap`}
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
      className="flex-none text-label uppercase text-ink2 border border-rule rounded-chip px-2 py-1"
    >
      source ↗
    </a>
  );
}

/* Internal counterpart to SourceLink: same chip, no new tab, darker ink because it stays on
   the site. A feed row carries one or the other, never both. */
export function DetailsLink({
  href,
  title = 'Open the bill page',
}: {
  href: string;
  title?: string;
}) {
  return (
    <a
      href={href}
      title={title}
      className="flex-none text-label uppercase text-ink2 border border-rule rounded-chip px-2 py-1 hover:border-lockInk hover:bg-canvas"
    >
      Details →
    </a>
  );
}
