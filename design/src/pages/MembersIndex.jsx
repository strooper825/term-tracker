import { useMemo, useState } from 'react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import MemberCard from '../components/MemberCard';
import MembersToolbar, { CHAMBERS, PARTIES } from '../components/MembersToolbar';

const byLastName = (a, b) => a.lastName.localeCompare(b.lastName);

/* Route: /members */
export default function MembersIndex({ members, congressLabel = '119th Congress' }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('Name (last)');
  const [offChamber, setOffChamber] = useState({});
  const [offParty, setOffParty] = useState({});

  const needle = q.trim().toLowerCase();
  const list = useMemo(() => members
    .filter(m => !offChamber[m.chamber] && !offParty[m.party])
    .filter(m => !needle || `${m.name} ${m.state} ${m.seatShort}`.toLowerCase().includes(needle))
    .sort((a, b) => sort === 'Attendance' ? b.attendance - a.attendance
      : sort === 'State' ? a.state.localeCompare(b.state) || byLastName(a, b)
      : byLastName(a, b)),
    [members, offChamber, offParty, needle, sort]);

  const counts = useMemo(() => ({
    chamber: Object.fromEntries(CHAMBERS.map(c => [c, members.filter(m => m.chamber === c).length])),
    party: Object.fromEntries(PARTIES.map(p => [p, members.filter(m => m.party === p).length]))
  }), [members]);

  const isFiltered = !!needle || Object.values(offChamber).some(Boolean) || Object.values(offParty).some(Boolean);
  const clear = () => { setQ(''); setOffChamber({}); setOffParty({}); };

  return (
    <div className="min-h-screen bg-canvas flex justify-center">
      <div className="w-full max-w-[1280px] bg-sheet border-x border-rule">
        <SiteHeader active="Members" />

        <section className="px-7 pt-7 flex flex-col gap-1">
          <h1 className="text-name font-semibold m-0">Members of the {congressLabel}</h1>
          <p className="text-sm text-ink3 tnum m-0">{members.length} tracked members · more coming</p>
        </section>

        <section className="px-7 pt-5 pb-7">
          <div className="border border-rule rounded-card bg-card">
            <MembersToolbar
              q={q} onQ={setQ} sort={sort} onSort={setSort}
              offChamber={offChamber} offParty={offParty}
              toggleChamber={c => setOffChamber(o => ({ ...o, [c]: !o[c] }))}
              toggleParty={p => setOffParty(o => ({ ...o, [p]: !o[p] }))}
              counts={counts} shown={list.length} total={members.length}
              isFiltered={isFiltered} onClear={clear} />

            <div className="p-[18px] grid grid-cols-1 lg:grid-cols-3 gap-4">
              {list.map(m => <MemberCard key={m.bioguideId} member={m} />)}
            </div>

            {list.length === 0 && (
              <div className="px-[18px] py-13 flex flex-col items-center gap-3 text-center">
                <p className="text-sm text-ink2 m-0">
                  {needle ? `No members match “${q.trim()}”.` : 'No members in the selected chambers and parties.'}
                </p>
                <button onClick={clear} className="text-sm border border-[#D9D6CF] rounded-ctl px-3 py-[7px] hover:bg-canvas">
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
