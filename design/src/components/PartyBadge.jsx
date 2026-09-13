import { PARTY_COLOR } from '../data/eventTypes';

/* Always renders the party WORD — never color alone. */
export default function PartyBadge({ party, size = 'md' }) {
  const cls = size === 'sm' ? 'text-[9px] px-1.5 tracking-[0.05em]' : 'text-[11px] px-[7px] tracking-[0.06em]';
  return (
    <span className={`${cls} py-0.5 font-semibold text-white rounded-chip whitespace-nowrap`}
          style={{ background: PARTY_COLOR[party] }}>
      {party.toUpperCase()}
    </span>
  );
}
