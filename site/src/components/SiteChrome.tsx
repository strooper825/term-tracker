// Breadcrumb, PartyBadge, SourceLink: ported from design/src/components. Safe to import from a
// client component: the header, footer and page shell, which read site/content from disk at
// build time, are in SiteFrame.tsx.
import { PARTY_COLOR, type PartyName } from '@/data/eventTypes';
import type { ArchiveBanner } from '@/lib/archive';

export const REPO_URL = 'https://github.com/strooper825/term-tracker';

/* Anything off this site opens in a new tab, so a reader never loses their place. */
const isExternal = (href: string) => /^https?:\/\//.test(href);
export const newTab = (href: string) =>
  isExternal(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {};

/* Shown on every page of an archive build (ADR 0021): a reader who lands here from a search
   must not take a finished Congress for the current one. */
export function ArchiveNotice({ banner }: { banner: ArchiveBanner }) {
  return (
    <p role="note" className="m-0 px-7 py-2.5 border-b border-rule bg-canvas text-meta text-ink2">
      <strong className="text-ink">Archive.</strong> This is the {banner.congressLabel}
      {banner.asOf ? ` as it stood on ${banner.asOf}` : ''}. It is no longer updated.
      {banner.liveUrl ? (
        <>
          {' '}
          <a href={banner.liveUrl} className="underline">
            Go to the current Congress
          </a>
        </>
      ) : null}
    </p>
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
    // The member card's own-row badge (Members index): bigger padding, and one fixed width so
    // REPUBLICAN, DEMOCRATIC and INDEPENDENT read as the same chip whatever the name beside it.
    lg: 'text-label px-[7px] py-[5px] inline-block w-[104px] text-center',
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
