// v1 event types: exactly four. Floor speech is Phase 3; see tailwind.config.js.
// A monochrome ramp (ink through ink4), darkest for the most frequent type -- not a hue per
// type -- so the timeline and feed read as one system with the rest of the page. Color is
// reserved for party and legislative meaning (see PARTY_COLOR below); it never marks a
// category of activity.
export type EventKey = 'vote' | 'sponsor' | 'cosponsor' | 'committee';

export const EVENT_TYPES: { key: EventKey; label: string; color: string }[] = [
  { key: 'vote', label: 'Floor vote', color: '#1A1A19' },
  { key: 'sponsor', label: 'Bill sponsored', color: '#57564F' },
  { key: 'cosponsor', label: 'Bill cosponsored', color: '#8A877F' },
  { key: 'committee', label: 'Committee action', color: '#A6A39C' },
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

// Red and blue carry party meaning; a member outside the two-party system reads in the same
// dark neutral as page text, not a third hue.
export const PARTY_COLOR: Record<PartyName, string> = {
  Republican: '#B9302F',
  Democratic: '#1F4E9C',
  Independent: '#57564F',
};
