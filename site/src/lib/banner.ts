/** The owner's site banner as the page uses it. No file access here, so the header (server) and
 *  the banner itself (browser) can both import it; lib/content.ts reads it from site.json. */

/** A notice across the top of every page, switched on and off in the editor. */
export interface Banner {
  message: string;
  /** Both set, or both empty: a link needs words and an address. */
  linkText: string;
  linkUrl: string;
  /** ISO date after which it is no longer shown, or ''. */
  until: string;
  /** The grey style, for a notice that should not shout. */
  quiet: boolean;
}

/** True once the banner's last day has passed, by the calendar of whoever is asking: the build
 *  leaves an expired banner out, and the browser takes one down between builds. */
export function bannerExpired(until: string, now = new Date()): boolean {
  if (!until) return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return today > until;
}
