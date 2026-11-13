// v1 event types: exactly four. Floor speech is Phase 3; see tailwind.config.js.
// A single-hue ramp on the site's own navy accent (#33477A -- the wordmark, term-progress bar,
// fundraising bars, and "Chair"/"On the ballot" emphasis all use the same color), darkest for
// the most frequent type. Not a hue per type: party red/blue still carries party meaning only
// (see PARTY_COLOR below), and this ramp never appears on a badge or chip.
export type EventKey = 'vote' | 'sponsor' | 'cosponsor' | 'committee';

export const EVENT_TYPES: { key: EventKey; label: string; color: string }[] = [
  { key: 'vote', label: 'Floor vote', color: '#33477A' },
  { key: 'sponsor', label: 'Bill sponsored', color: '#4C63A0' },
  { key: 'cosponsor', label: 'Bill cosponsored', color: '#7F92C4' },
  { key: 'committee', label: 'Committee action', color: '#C2CCDF' },
];

export const EVENT_COLOR: Record<EventKey, string> = Object.fromEntries(
  EVENT_TYPES.map((t) => [t.key, t.color]),
) as Record<EventKey, string>;

/** Maps mart.member_feed.event_type to the v1 event key. */
export const EVENT_TYPE_FROM_MART: Record<string, EventKey> = {
  vote: 'vote',
  bill_sponsored: 'sponsor',
  bill_cosponsored: 'cosponsor',
  committee_action: 'committee',
};

export type PartyName = 'Republican' | 'Democratic' | 'Independent';

// Red, blue and purple carry party meaning and nothing else: on a badge, a filter chip, the
// composition bar and the homepage map (ADR 0022). Vote bars keep their own Yea/Nay scheme.
export const PARTY_COLOR: Record<PartyName, string> = {
  Republican: '#B9302F',
  Democratic: '#1F4E9C',
  Independent: '#6B3FA0',
};
