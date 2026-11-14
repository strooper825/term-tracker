/** The Elections menu (ADR 0024): the what-if maps that exist, and the races that are announced
 *  but not built. A "soon" race has a placeholder page so the header can link to it today. */

/** The cycle the header menu and /elections open on. */
export const DEFAULT_CYCLE = 2028;

export interface SoonRace {
  slug: string;
  label: string;
  /** The page's heading. */
  title: string;
  /** One line on what the page will be. */
  blurb: string;
}

export const SOON_RACES: SoonRace[] = [
  { slug: 'house', label: 'House', title: 'House elections', blurb: 'All 435 House races, district by district.' },
];

export const ELECTION_LINKS = [
  { label: 'President', href: `/elections/${DEFAULT_CYCLE}/president` },
  { label: 'Senate', href: `/elections/${DEFAULT_CYCLE}/senate` },
  { label: 'Governor', href: `/elections/${DEFAULT_CYCLE}/governor` },
  ...SOON_RACES.map((r) => ({ label: r.label, href: `/elections/${r.slug}`, soon: true })),
];
