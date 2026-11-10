// Archive wiring (ADR 0021). The live site describes one Congress. When a Congress ends, its
// last build is deployed once to its own address and never rebuilt; that build is told it is an
// archive, and the live site is told where the archives are. Both are build-time settings read
// from the environment, so the same code makes either site.
//
//   Archive build:  NEXT_PUBLIC_ARCHIVE_OF=119  NEXT_PUBLIC_ARCHIVE_AS_OF=2027-01-05
//                   NEXT_PUBLIC_LIVE_URL=https://example.org
//   Live build:     NEXT_PUBLIC_ARCHIVES=119=https://archive-119.example.org
//
// NEXT_PUBLIC_ so the values are inlined into client components too; none of them is a secret.
import { formatDate, ordinal } from './format';

export interface ArchiveBanner {
  /** "119th Congress" */
  congressLabel: string;
  /** "Jan 5, 2027", or null when the build was not given a date. */
  asOf: string | null;
  /** The live site, or null when the build was not given one. */
  liveUrl: string | null;
}

export interface ArchiveLink {
  /** "119th Congress archive" */
  label: string;
  href: string;
}

type Env = Record<string, string | undefined>;

const isHttpUrl = (value: string) => /^https?:\/\/\S+$/.test(value);
const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** The banner of an archive build, or null on the live site. A value that is not a Congress
 *  number fails the build rather than publishing a mislabelled archive. */
export function archiveBanner(env: Env): ArchiveBanner | null {
  const of = env.NEXT_PUBLIC_ARCHIVE_OF?.trim();
  if (!of) return null;
  if (!/^\d{1,3}$/.test(of)) throw new Error(`NEXT_PUBLIC_ARCHIVE_OF is not a Congress number: ${of}`);
  const asOf = env.NEXT_PUBLIC_ARCHIVE_AS_OF?.trim();
  if (asOf && !isIsoDate(asOf)) {
    throw new Error(`NEXT_PUBLIC_ARCHIVE_AS_OF is not a YYYY-MM-DD date: ${asOf}`);
  }
  const live = env.NEXT_PUBLIC_LIVE_URL?.trim();
  if (live && !isHttpUrl(live)) throw new Error(`NEXT_PUBLIC_LIVE_URL is not a URL: ${live}`);
  return {
    congressLabel: `${ordinal(Number(of))} Congress`,
    asOf: asOf ? formatDate(asOf) : null,
    liveUrl: live || null,
  };
}

/** Links from the live site to earlier Congresses: "119=https://a,118=https://b". */
export function archiveLinks(env: Env): ArchiveLink[] {
  const raw = env.NEXT_PUBLIC_ARCHIVES?.trim();
  if (!raw) return [];
  return raw.split(',').map((entry) => {
    const [congress, ...rest] = entry.trim().split('=');
    const href = rest.join('=');
    if (!/^\d{1,3}$/.test(congress) || !isHttpUrl(href)) {
      throw new Error(`NEXT_PUBLIC_ARCHIVES entry is not "<congress>=<url>": ${entry}`);
    }
    return { label: `${ordinal(Number(congress))} Congress archive`, href };
  });
}

// Read once, with each name written out in full: Next inlines process.env.NEXT_PUBLIC_X only
// where it appears literally.
const BUILD_ENV: Env = {
  NEXT_PUBLIC_ARCHIVE_OF: process.env.NEXT_PUBLIC_ARCHIVE_OF,
  NEXT_PUBLIC_ARCHIVE_AS_OF: process.env.NEXT_PUBLIC_ARCHIVE_AS_OF,
  NEXT_PUBLIC_LIVE_URL: process.env.NEXT_PUBLIC_LIVE_URL,
  NEXT_PUBLIC_ARCHIVES: process.env.NEXT_PUBLIC_ARCHIVES,
};

export const ARCHIVE_BANNER = archiveBanner(BUILD_ENV);
export const ARCHIVE_LINKS = archiveLinks(BUILD_ENV);
