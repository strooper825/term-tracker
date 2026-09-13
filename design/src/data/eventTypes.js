// v1 event types — exactly four. Floor speech is Phase 3; see tailwind.config.js.
export const EVENT_TYPES = [
  { key: 'vote',      label: 'Floor vote',       color: '#B45309' },
  { key: 'sponsor',   label: 'Bill sponsored',   color: '#0E7C66' },
  { key: 'cosponsor', label: 'Bill cosponsored', color: '#6D4AA8' },
  { key: 'committee', label: 'Committee action', color: '#4B5566' }
];

export const EVENT_COLOR = Object.fromEntries(EVENT_TYPES.map(t => [t.key, t.color]));

export const PARTY_COLOR = {
  Republican: '#B9302F',
  Democratic: '#1F4E9C',
  Independent: '#5F6B3A'
};
