'use client';

// MembersIndex, MembersToolbar, MemberCard: ported from design/src/pages/MembersIndex.jsx and
// design/src/components. Filtering, sorting, and search are client-side over the embedded rows.
import { useMemo, useState } from 'react';
import { PARTY_COLOR, type PartyName } from '@/data/eventTypes';
import type { Chamber, IndexRow } from '@/lib/model';
import { FilterChip } from './FilterChip';
import { PartyBadge } from './SiteChrome';

export const CHAMBERS: Chamber[] = ['House', 'Senate'];
export const PARTIES: PartyName[] = ['Republican', 'Democratic', 'Independent'];
export const SORTS = ['Name (last)', 'State', 'Attendance'] as const;
type Sort = (typeof SORTS)[number];

const byLastName = (a: IndexRow, b: IndexRow) => a.lastName.localeCompare(b.lastName);

function MemberCard({ member }: { member: IndexRow }) {
  const stats = [
    { value: member.attendance === null ? 'n/a' : member.attendance.toFixed(2) + '%', label: 'Attendance' },
    { value: String(member.sponsored), label: 'Sponsored' },
    { value: member.unity === null ? 'n/a' : member.unity.toFixed(2) + '%', label: 'Party unity' },
  ];
  return (
    <a
      href={`/members/${member.bioguideId}`}
      className="flex flex-col gap-3 border border-rule rounded-card bg-card p-4 text-ink no-underline hover:border-lockInk hover:bg-[#FCFBF9]"
    >
      <div className="flex items-start gap-3">
        <div className="w-[46px] h-[46px] rounded-full bg-[#DEDCD6] border border-[#D3D0C9] flex-none" />
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold">{member.name}</span>
            <PartyBadge party={member.party} size="sm" />
          </div>
          <span className="text-sm text-ink3">{member.seatShort}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 border-t border-ruleSoft pt-[11px]">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5">
            <span className="text-base font-semibold tnum">{s.value}</span>
            <span className="text-[10px] uppercase tracking-[0.06em] text-ink4 leading-tight">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </a>
  );
}

export function MembersIndex({ members, congressLabel }: { members: IndexRow[]; congressLabel: string }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('Name (last)');
  const [offChamber, setOffChamber] = useState<Partial<Record<Chamber, boolean>>>({});
  const [offParty, setOffParty] = useState<Partial<Record<PartyName, boolean>>>({});

  const needle = q.trim().toLowerCase();
  const list = useMemo(
    () =>
      members
        .filter((m) => !offChamber[m.chamber] && !offParty[m.party])
        .filter((m) => !needle || `${m.name} ${m.state} ${m.seatShort}`.toLowerCase().includes(needle))
        .sort((a, b) =>
          sort === 'Attendance'
            ? (b.attendance ?? -1) - (a.attendance ?? -1)
            : sort === 'State'
              ? a.state.localeCompare(b.state) || byLastName(a, b)
              : byLastName(a, b),
        ),
    [members, offChamber, offParty, needle, sort],
  );

  const counts = useMemo(
    () => ({
      chamber: Object.fromEntries(CHAMBERS.map((c) => [c, members.filter((m) => m.chamber === c).length])),
      party: Object.fromEntries(PARTIES.map((p) => [p, members.filter((m) => m.party === p).length])),
    }),
    [members],
  );

  const isFiltered =
    !!needle || Object.values(offChamber).some(Boolean) || Object.values(offParty).some(Boolean);
  const clear = () => {
    setQ('');
    setOffChamber({});
    setOffParty({});
  };

  const group = (label: string, children: React.ReactNode) => (
    <div className="flex items-center gap-[7px]">
      <span className="text-label uppercase text-ink4">{label}</span>
      <div className="flex gap-1.5 flex-wrap">{children}</div>
    </div>
  );

  return (
    <>
      <section className="px-7 pt-7 flex flex-col gap-1">
        <h1 className="text-name font-semibold m-0">Members of the {congressLabel}</h1>
        <p className="text-sm text-ink3 tnum m-0">{members.length} tracked members · more coming</p>
      </section>

      <section className="px-7 pt-5 pb-7">
        <div className="border border-rule rounded-card bg-card">
          <div className="px-[18px] pt-3.5 pb-3 border-b border-ruleSoft flex flex-col gap-[11px]">
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name or state…"
                aria-label="Search members"
                className="flex-1 basis-64 min-w-[200px] text-sm bg-card border border-[#D9D6CF] rounded-ctl px-2.5 py-[7px] focus:border-ink3 focus:outline-none"
              />
              <label className="flex items-center gap-[7px] text-meta text-ink3 flex-none">
                Sort
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="text-sm bg-card border border-[#D9D6CF] rounded-ctl px-2 py-1.5"
                >
                  {SORTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-3.5 flex-wrap">
              {group(
                'Chamber',
                CHAMBERS.map((c) => (
                  <FilterChip
                    key={c}
                    label={c}
                    count={counts.chamber[c] || 0}
                    on={!offChamber[c]}
                    onToggle={() => setOffChamber((o) => ({ ...o, [c]: !o[c] }))}
                  />
                )),
              )}
              {group(
                'Party',
                PARTIES.map((p) => (
                  <FilterChip
                    key={p}
                    label={p}
                    count={counts.party[p] || 0}
                    color={PARTY_COLOR[p]}
                    on={!offParty[p]}
                    onToggle={() => setOffParty((o) => ({ ...o, [p]: !o[p] }))}
                  />
                )),
              )}
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="text-meta text-ink3 tnum">
                {list.length} of {members.length} members
              </span>
              {isFiltered && (
                <button type="button" onClick={clear} className="text-meta text-[#1F4E9C]">
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="p-[18px] grid grid-cols-1 lg:grid-cols-3 gap-4">
            {list.map((m) => (
              <MemberCard key={m.bioguideId} member={m} />
            ))}
          </div>

          {list.length === 0 && (
            <div className="px-[18px] py-12 flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-ink2 m-0">
                {needle
                  ? `No members match “${q.trim()}”.`
                  : 'No members in the selected chambers and parties.'}
              </p>
              <button
                type="button"
                onClick={clear}
                className="text-sm border border-[#D9D6CF] rounded-ctl px-3 py-[7px] hover:bg-canvas"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
