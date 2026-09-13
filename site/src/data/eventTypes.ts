// v1 event types: exactly four. Floor speech is Phase 3; see tailwind.config.js.
export type EventKey = 'vote' | 'sponsor' | 'cosponsor' | 'committee';

export const EVENT_TYPES: { key: EventKey; label: string; color: string }[] = [
  { key: 'vote', label: 'Floor vote', color: '#B45309' },
  { key: 'sponsor', label: 'Bill sponsored', color: '#0E7C66' },
  { key: 'cosponsor', label: 'Bill cosponsored', color: '#6D4AA8' },
  { key: 'committee', label: 'Committee action', color: '#4B5566' },
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

export const PARTY_COLOR: Record<PartyName, string> = {
  Republican: '#B9302F',
  Democratic: '#1F4E9C',
  Independent: '#5F6B3A',
};
