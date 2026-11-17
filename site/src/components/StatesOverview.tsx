// The States section's front page (/states, ADR 0035): the national control map and every state
// listed by who controls it. Server component; the map is the client StateControlMap.
import { formatDate } from '@/lib/format';
import { CONTROL_LEGEND, controlLabel, type Control, type StatesResponse } from '@/lib/states';
import { PageShell } from './SiteFrame';
import { StateControlMap, type ControlMapState } from './StateControlMap';

const GROUPS: { key: Control | 'other'; label: string }[] = [
  ...CONTROL_LEGEND.filter((l) => l.key !== 'N').map((l) => ({ key: l.key, label: l.label })),
  { key: 'other', label: 'Other' },
];

export function StatesOverview({ data, lastUpdated }: { data: StatesResponse; lastUpdated: string | null }) {
  const states: ControlMapState[] = data.states.map((s) => ({
    state: s.state,
    name: s.name,
    control: s.control,
    controlLabel: controlLabel(s),
    governor: s.governor ? `${s.governor.title} ${s.governor.name}` : null,
  }));
  const groupOf = (c: Control) => (c === 'R' || c === 'D' || c === 'split' ? c : 'other');
  const source = data.sources[0];

  return (
    <PageShell active="States" lastUpdated={lastUpdated}>
      <section className="px-7 pt-6 pb-6 border-b border-rule flex items-end justify-between gap-x-6 gap-y-2 flex-wrap">
        <div className="flex flex-col gap-1">
          <p className="text-label uppercase text-ink2 m-0">States</p>
          <h1 className="text-title font-semibold text-ink m-0">State governments</h1>
        </div>
        <p className="m-0 text-meta text-ink2 tnum">As of {formatDate(data.as_of)}</p>
      </section>

      <main>
        <div className="px-4 md:px-7 pt-7 pb-7 bg-canvas flex flex-col gap-8">
          <StateControlMap states={states} />

          <section aria-labelledby="state-list-heading" className="border border-rule rounded-card bg-card">
            <h2 id="state-list-heading" className="m-0 px-[18px] pt-4 pb-3 border-b border-ruleSoft text-heading font-semibold text-ink">
              Every state
            </h2>
            <div className="px-[18px] py-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {GROUPS.map((g) => {
                const members = states.filter((s) => groupOf(s.control) === g.key);
                if (members.length === 0) return null;
                return (
                  <div key={g.key} className="flex flex-col gap-2">
                    <h3 className="m-0 text-[15px] font-semibold text-ink">
                      {g.label} <span className="text-ink2 font-normal tnum">({members.length})</span>
                    </h3>
                    <ul className="m-0 p-0 list-none flex flex-col gap-1">
                      {members.map((s) => (
                        <li key={s.state} className="text-[14px]">
                          <a href={`/states/${s.state.toLowerCase()}`} className="text-navy hover:text-ink">
                            {s.name}
                          </a>
                          {g.key === 'other' && <span className="text-ink2"> · {s.controlLabel}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        <p className="px-7 pb-6 text-label uppercase text-ink2 m-0 leading-relaxed">
          Governors and legislators: Open States (Plural Open), public domain
          {source ? `, read ${formatDate(source.fetched_at.slice(0, 10))}` : ''}. A party controls a
          chamber with more than half of all its seats, vacant ones included. Parties other than the
          Democrats and Republicans are coloured as independent or other.
        </p>
      </main>
    </PageShell>
  );
}
