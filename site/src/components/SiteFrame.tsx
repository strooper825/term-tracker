// The header, footer and page shell every page shares (ADR 0022). Server only: the footer reads
// site/content/site.json from disk at build time, so no client component may import this file.
import type { ReactNode } from 'react';
import { ARCHIVE_BANNER, ARCHIVE_LINKS } from '@/lib/archive';
import { loadSite } from '@/lib/content';
import { ELECTION_LINKS } from '@/lib/sections';
import { Logo } from './Logo';
import { NavMenu } from './NavMenu';
import { ArchiveNotice, newTab } from './SiteChrome';

/** Which top-level section a page belongs to; the header underlines it. */
export type NavKey = 'Home' | 'Congress' | 'Elections' | 'States' | 'Articles' | 'About';

export const CONGRESS_LINKS = [
  { label: 'Overview', href: '/congress' },
  { label: 'Members', href: '/members' },
  { label: 'Search bills', href: '/search?bills' },
];

export const ABOUT_LINKS = [
  { label: 'About Term', href: '/about' },
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
      className={`${key === 'Home' ? 'hidden md:inline-flex' : 'inline-flex'} items-center gap-1.5 px-1.5 md:px-3 py-2.5 border-b-2 text-[14px] md:text-[15px] ${
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
              aria-label="Support"
              className="inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] md:min-h-[40px] px-0 md:px-4 border-[1.5px] border-navy rounded-ctl text-[14px] font-semibold text-navy hover:bg-navy hover:text-white"
            >
              <HeartIcon />
              <span className="hidden md:inline">Support</span>
            </a>
          </div>
          <Logo size="header" />
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
        <nav aria-label="Main" className="flex flex-wrap justify-center gap-x-0 md:gap-x-2 gap-y-0 px-1 md:px-4 py-0.5 md:py-1">
          {tab('Home', '/')}
          <NavMenu label="Congress" links={CONGRESS_LINKS} active={active === 'Congress'} />
          <NavMenu label="Elections" links={ELECTION_LINKS} active={active === 'Elections'} />
          {tab(
            'States',
            '/states',
            <span className="hidden md:inline text-micro font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-chip bg-lockBg text-ink2">
              Soon
            </span>,
          )}
          {tab('Articles', '/articles')}
          <NavMenu label="About" links={ABOUT_LINKS} active={active === 'About'} alignRight />
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
    { label: 'States (soon)', href: '/states' },
    { label: 'Articles', href: '/articles' },
  ];
  const quick = [
    { label: 'About', href: '/about' },
    { label: 'Methodology', href: '/methodology' },
    ...(site.contactEmail ? [{ label: 'Contact', href: `mailto:${site.contactEmail}` }] : []),
    { label: 'Support Term', href: '/support' },
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
            <div>
              <Logo size="footer" tone="dark" />
            </div>
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
          <span>© {new Date().getFullYear()} Term</span>
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

