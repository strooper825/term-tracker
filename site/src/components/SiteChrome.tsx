// Breadcrumb, PartyBadge, SourceLink: ported from design/src/components. The header, footer and
// page shell follow the homepage design of ADR 0022: one permanent header for every section.
import type { ReactNode } from 'react';
import { PARTY_COLOR, type PartyName } from '@/data/eventTypes';
import { ARCHIVE_BANNER, ARCHIVE_LINKS, type ArchiveBanner } from '@/lib/archive';
import { loadSite } from '@/lib/content';
import { NavMenu } from './NavMenu';

export const REPO_URL = 'https://github.com/strooper825/term-tracker';

/* Anything off this site opens in a new tab, so a reader never loses their place. */
const isExternal = (href: string) => /^https?:\/\//.test(href);
const newTab = (href: string) =>
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

/** Which top-level section a page belongs to; the header underlines it. */
export type NavKey = 'Home' | 'Congress' | 'Elections' | 'Articles' | 'About';

export const CONGRESS_LINKS = [
  { label: 'Overview', href: '/congress' },
  { label: 'Members', href: '/members' },
  { label: 'Search bills', href: '/search?bills' },
];

export const ABOUT_LINKS = [
  { label: 'About Term Tracker', href: '/about' },
  { label: 'Methodology & sources', href: '/methodology' },
];

function HeartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/** The permanent header: Support, the wordmark and search on the first row, the sections on
 *  the second. It stays at the top of the window while the page scrolls. */
export function SiteHeader({ active }: { active: NavKey }) {
  const tab = (key: NavKey, href: string, extra?: ReactNode) => (
    <a
      href={href}
      aria-current={active === key ? 'page' : undefined}
      className={`inline-flex items-center gap-1.5 px-3 py-2.5 border-b-2 text-[15px] ${
        active === key ? 'font-semibold text-ink border-navy' : 'text-ink2 border-transparent hover:text-ink'
      }`}
    >
      {key}
      {extra}
    </a>
  );
  return (
    <>
      {ARCHIVE_BANNER ? <ArchiveNotice banner={ARCHIVE_BANNER} /> : null}
      <header className="sticky top-0 z-30 bg-sheet border-b border-rule">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-4 md:px-6 py-3 border-b border-ruleSoft">
          <div className="flex items-center">
            <a
              href="/support"
              className="inline-flex items-center gap-2 min-h-[40px] px-3 md:px-4 border-[1.5px] border-navy rounded-ctl text-[14px] font-semibold text-navy hover:bg-navy hover:text-white"
            >
              <HeartIcon />
              <span>Support</span>
            </a>
          </div>
          <a
            href="/"
            className="text-[17px] md:text-[20px] font-bold uppercase tracking-[0.14em] text-navy text-center whitespace-nowrap"
          >
            Term Tracker
          </a>
          <div className="flex justify-end">
            <a
              href="/search"
              aria-label="Search members and bills"
              className="w-11 h-11 inline-flex items-center justify-center border border-rule rounded-full bg-card text-ink hover:border-ink3"
            >
              <SearchIcon />
            </a>
          </div>
        </div>
        <nav aria-label="Main" className="flex flex-wrap justify-center gap-x-2 gap-y-0 px-4 py-1">
          {tab('Home', '/')}
          <NavMenu label="Congress" links={CONGRESS_LINKS} active={active === 'Congress'} />
          {tab(
            'Elections',
            '/elections',
            <span className="text-micro font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-chip bg-lockBg text-ink2">
              Soon
            </span>,
          )}
          {tab('Articles', '/articles')}
          <NavMenu label="About" links={ABOUT_LINKS} active={active === 'About'} />
        </nav>
      </header>
    </>
  );
}

/** The dark footer on every page. Its words come from site/content/site.json. */
export function SiteFooter({ lastUpdated }: { lastUpdated: string | null }) {
  const site = loadSite();
  const sections = [
    { label: 'Congress overview', href: '/congress' },
    { label: 'Members', href: '/members' },
    { label: 'Elections (soon)', href: '/elections' },
    { label: 'Articles', href: '/articles' },
  ];
  const quick = [
    { label: 'About', href: '/about' },
    { label: 'Methodology', href: '/methodology' },
    ...(site.contactEmail ? [{ label: 'Contact', href: `mailto:${site.contactEmail}` }] : []),
    { label: 'Support Term Tracker', href: '/support' },
    { label: 'Privacy policy', href: '/privacy' },
  ];
  const column = (title: string, links: { label: string; href: string }[]) => (
    <div className="flex flex-col gap-3 min-w-[150px]">
      <h2 className="m-0 text-[16px] font-semibold text-white">{title}</h2>
      <ul className="m-0 p-0 list-none flex flex-col gap-3">
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href} className="text-[15px] text-[#C9C7C0] hover:text-white">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <footer className="bg-ink text-[#C9C7C0]">
      <div className="max-w-[1180px] mx-auto px-6 pt-14 pb-6 flex flex-col gap-8">
        <div className="flex flex-wrap justify-between gap-10">
          <div className="flex-[1_1_340px] max-w-[520px] flex flex-col gap-4">
            <span className="text-[18px] font-bold uppercase tracking-[0.14em] text-white">Term Tracker</span>
            {site.mission && <p className="m-0 text-[15px] leading-relaxed">{site.mission}</p>}
            <p className="m-0 text-[15px]">
              We are <strong className="text-white">nonpartisan and independent.</strong>
            </p>
            {site.socials.length > 0 && (
              <ul className="m-0 p-0 list-none flex flex-wrap gap-2.5">
                {site.socials.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      {...newTab(s.url)}
                      className="inline-flex items-center min-h-[36px] px-3 border border-ink2 rounded-full text-[14px] text-white hover:border-white"
                    >
                      {s.label}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-14">
            {column('Sections', sections)}
            {column('Quick links', quick)}
          </div>
        </div>
        <div className="border-t border-[#3A3A37] pt-4 flex flex-wrap gap-x-5 gap-y-2 text-meta text-[#A6A39C]">
          <span>© {new Date().getFullYear()} Term Tracker</span>
          {lastUpdated && <span>Data last updated {lastUpdated}</span>}
          {ARCHIVE_LINKS.map((archive) => (
            <a key={archive.href} href={archive.href} className="hover:text-white">
              {archive.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}

/** Header, the page's own content on the off-white sheet, footer. `wide` drops the sheet's
 *  1280px column for pages that lay themselves out (the homepage). */
export function PageShell({
  active,
  lastUpdated = null,
  wide = false,
  children,
}: {
  active: NavKey;
  lastUpdated?: string | null;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <SiteHeader active={active} />
      <div className="flex-1 flex justify-center">
        {wide ? (
          <div className="w-full">{children}</div>
        ) : (
          <div className="w-full max-w-[1280px] bg-sheet border-x border-rule">{children}</div>
        )}
      </div>
      <SiteFooter lastUpdated={lastUpdated} />
    </div>
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
