import FilterChip from './FilterChip';
import { PARTY_COLOR } from '../data/eventTypes';

export const CHAMBERS = ['House', 'Senate'];
export const PARTIES = ['Republican', 'Democratic', 'Independent'];
export const SORTS = ['Name (last)', 'State', 'Attendance'];

/* Built to hold hundreds of members: counts come from the full index, and the
   result line is always "<shown> of <total> members". */
export default function MembersToolbar({
  q, onQ, sort, onSort, offChamber, offParty, toggleChamber, toggleParty,
  counts, shown, total, isFiltered, onClear
}) {
  const group = (label, children) => (
    <div className="flex items-center gap-[7px]">
      <span className="text-label uppercase text-ink4">{label}</span>
      <div className="flex gap-1.5 flex-wrap">{children}</div>
    </div>
  );
  return (
    <div className="px-[18px] pt-3.5 pb-3 border-b border-ruleSoft flex flex-col gap-[11px]">
      <div className="flex items-center gap-3 flex-wrap">
        <input type="search" value={q} onChange={e => onQ(e.target.value)}
          placeholder="Search by name or state…"
          className="flex-1 basis-64 min-w-[200px] text-sm bg-card border border-[#D9D6CF] rounded-ctl px-2.5 py-[7px] focus:border-ink3 focus:outline-none" />
        <label className="flex items-center gap-[7px] text-meta text-ink3 flex-none">
          Sort
          <select value={sort} onChange={e => onSort(e.target.value)}
            className="text-sm bg-card border border-[#D9D6CF] rounded-ctl px-2 py-1.5">
            {SORTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3.5 flex-wrap">
        {group('Chamber', CHAMBERS.map(c => (
          <FilterChip key={c} label={c} count={counts.chamber[c] || 0} on={!offChamber[c]} onToggle={() => toggleChamber(c)} />
        )))}
        {group('Party', PARTIES.map(p => (
          <FilterChip key={p} label={p} count={counts.party[p] || 0} color={PARTY_COLOR[p]} on={!offParty[p]} onToggle={() => toggleParty(p)} />
        )))}
      </div>
      <div className="flex items-baseline gap-2.5">
        <span className="text-meta text-ink3 tnum">{shown} of {total} members</span>
        {isFiltered && <button onClick={onClear} className="text-meta text-[#1F4E9C]">Clear</button>}
      </div>
    </div>
  );
}
