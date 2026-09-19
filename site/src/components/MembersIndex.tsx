'use client';

// MembersIndex, MembersToolbar, MemberCard: ported from design/src/pages/MembersIndex.jsx and
// design/src/components. Filtering, sorting, and search are client-side over the embedded rows.
import { useMemo, useState } from 'react';
import { PARTY_COLOR, type PartyName } from '@/data/eventTypes';
import type { Chamber, IndexRow } from '@/lib/model';
import { FilterChip } from './FilterChip';
import { MemberPhoto } from './MemberPhoto';
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
        <MemberPhoto
          photoUrl={member.photoUrl}
          bioguideId={member.bioguideId}
          className="w-[35px] h-[35px] rounded-full"
        />
        <div className="flex flex-col gap-1.5 min-w-0">
          <span className="text-base font-semibold leading-snug">{member.name}</span>
          <span className="self-start">
            <PartyBadge party={member.party} size="lg" />
          </span>
          <span className="text-meta text-ink3">{member.seatShort}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 border-t border-rule pt-[11px]">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1">
            <span className="text-label uppercase text-ink3 leading-tight">
              {s.label}
            </span>
            <span className="text-stat font-semibold text-ink tnum leading-none">{s.value}</span>
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
      <span className="text-label uppercase text-ink3">{label}</span>
      <div className="flex gap-1.5 flex-wrap">{children}</div>
    </div>
  );

  const headerStats = [
    { label: 'House', value: counts.chamber['House'] || 0 },
    { label: 'Senate', value: counts.chamber['Senate'] || 0 },
    { label: 'Tracked', value: members.length },
  ];

  return (
    <>
      <section className="px-7 pt-7 flex items-start justify-between gap-6 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-title font-semibold text-ink m-0">
            Members of the {congressLabel}
          </h1>
          <p className="text-label uppercase text-ink3 tnum m-0">
            {members.length} tracked members
          </p>
        </div>
        <div className="flex gap-9">
          {headerStats.map((s) => (
            <div key={s.label} className="flex flex-col gap-0.5">
              <span className="text-label uppercase text-ink3">{s.label}</span>
              <span className="text-stat font-semibold text-ink tnum leading-none">{s.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="px-7 pt-5 pb-7">
        <div className="border border-rule rounded-card bg-card">
          <div className="px-[18px] pt-4 pb-[15px] border-b border-rule flex flex-col gap-[15px]">
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name or state…"
                aria-label="Search members"
                className="flex-1 basis-64 min-w-[200px] text-body bg-[#ECEEF3] border border-rule rounded-ctl px-[10px] py-[8px] focus:border-ink3 focus:outline-none"
              />
              <label className="flex items-center gap-[7px] text-label uppercase text-ink3 flex-none border border-rule rounded-ctl pl-[10px] pr-2 py-[8px]">
                Sort
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="text-body normal-case tracking-normal text-ink bg-card"
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
              <span aria-hidden className="w-px h-[16.5px] bg-rule flex-none" />
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
          </div>
          <div className="px-[18px] py-3 flex items-baseline gap-2.5">
            <span className="text-label uppercase text-ink3 tnum">
              {list.length} of {members.length} members
            </span>
            {isFiltered && (
              <button
                type="button"
                onClick={clear}
                className="text-meta text-ink2 underline decoration-rule underline-offset-2"
              >
                Clear
              </button>
            )}
          </div>

          <div className="p-[18px] grid grid-cols-1 lg:grid-cols-3 gap-5">
            {list.map((m) => (
              <MemberCard key={m.bioguideId} member={m} />
            ))}
          </div>

          {list.length === 0 && (
            <div className="px-[18px] py-12 flex flex-col items-center gap-3 text-center">
              <p className="text-body text-ink2 m-0">
                {needle
                  ? `No members match “${q.trim()}”.`
                  : 'No members in the selected chambers and parties.'}
              </p>
              <button
                type="button"
                onClick={clear}
                className="text-body border border-[#D9D6CF] rounded-ctl px-3 py-[7px] hover:bg-canvas"
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
