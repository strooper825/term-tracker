/** The sections that are announced but not built yet (ADR 0022). Each has a placeholder page so
 *  the header can link to it today and the real page can replace it at the same address. */

export interface ElectionRace {
  slug: string;
  label: string;
  /** One line on what the page will cover. */
  blurb: string;
}

export const ELECTION_RACES: ElectionRace[] = [
  {
    slug: 'presidential',
    label: 'Presidential',
    blurb: 'The race for the White House: primaries, candidates, fundraising and results by state.',
  },
  {
    slug: 'senate',
    label: 'Senate',
    blurb: 'Every Senate seat on the ballot, with the incumbent, the challengers and the money.',
  },
  {
    slug: 'house',
    label: 'House',
    blurb: 'All 435 House races, district by district, from the primary to the result.',
  },
  {
    slug: 'governor',
    label: 'Governor',
    blurb: 'Governor races in every state that holds one, with candidates and results.',
  },
];

export const ELECTION_LINKS = ELECTION_RACES.map((r) => ({
  label: r.label,
  href: `/elections/${r.slug}`,
  soon: true,
}));
