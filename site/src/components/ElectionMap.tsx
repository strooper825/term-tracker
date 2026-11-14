'use client';

// The what-if election map (ADR 0024): pick who wins each race and watch the count move.
// The map itself is data from the build (lib/elections.ts). The visitor's picks live in this
// component and in their browser's local storage, and go nowhere else. State shapes are the
// ones the homepage ships (public/maps/national.json).
import { useEffect, useMemo, useState } from 'react';
import {
  HOLD,
  OFFICE_LABEL,
  SIDE_FILL,
  SIDE_WORD,
  STATE_NAMES,
  changed,
  chosen,
  control,
  nextKey,
  standing,
  stateSeats,
  stripeOf,
  tally,
  validPicks,
  type ElectionMapData,
  type Picks,
  type Race,
  type Side,
  type View,
} from '@/lib/elections';

export interface MapLink {
  label: string;
  href: string;
  active?: boolean;
  soon?: boolean;
}

interface Shapes {
  w: number;
  h: number;
  states: { abbr: string; name: string; d: string }[];
}

const OFF = '#F6F5F2';
const SMALL = ['VT', 'NH', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD', 'DC', 'HI'];
const PAIRS: [Side, Side][] = [['D', 'I'], ['D', 'R'], ['D', 'U'], ['I', 'R'], ['I', 'U'], ['R', 'U']];
const SEAT_WORD: Record<Side, string> = { D: 'Democratic', R: 'Republican', I: 'independent', U: 'undecided' };

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** Where a visitor's map is kept in their browser: one entry per map. */
export const storageKey = (map: ElectionMapData) => `term-elections-${map.cycle}-${map.office}`;

function fillOf(seats: Side[] | undefined): string {
  if (!seats?.length) return OFF;
  const [a, b] = stripeOf(seats);
  return a === b ? SIDE_FILL[a] : `url(#stripe-${a}${b})`;
}

function chipStyle(seats: Side[]): { background: string; color: string } {
  const [a, b] = stripeOf(seats);
  return {
    background: a === b ? SIDE_FILL[a] : `linear-gradient(135deg, ${SIDE_FILL[a]} 50%, ${SIDE_FILL[b]} 50%)`,
    color: a === 'U' && b === 'U' ? '#1A1A19' : '#FFFFFF',
  };
}

/** "Both senators Republican", "One Democratic senator, one independent", "Republican Governor". */
function seatWords(map: ElectionMapData, seats: Side[] | undefined, view: View): string {
  if (!seats?.length) return `Not on the ballot in ${map.cycle}`;
  const word = (s: Side) => (view === 'final' && s === 'U' ? 'not called' : SEAT_WORD[s]);
  if (map.office !== 'senate' || seats.length === 1) {
    const w = word(seats[0]);
    return `${w[0].toUpperCase()}${w.slice(1)}${view === 'full' && map.office === 'governor' ? ' Governor' : ''}`;
  }
  const [a, b] = [...seats].sort((x, y) => 'DRIU'.indexOf(x) - 'DRIU'.indexOf(y));
  return a === b ? `Both senators ${word(a)}` : `One ${word(a)} senator, one ${word(b)}`;
}

const segment = (on: boolean) =>
  `min-h-[44px] px-4 border-0 text-[14px] font-semibold cursor-pointer ${on ? 'bg-navy text-white' : 'bg-card text-ink hover:bg-canvas'}`;

const TITLE = { president: 'presidential election', senate: 'Senate elections', governor: 'Governor elections' } as const;
const NOW = { president: '2024 result', senate: 'Senate now', governor: 'Governors now' } as const;

export function ElectionMap({ map, offices, cycles }: { map: ElectionMapData; offices: MapLink[]; cycles: MapLink[] }) {
  const president = map.office === 'president';
  const called = map.races.filter((r) => r.result).length;
  const [shapes, setShapes] = useState<Shapes | null>(null);
  const [failed, setFailed] = useState(false);
  const [picks, setPicks] = useState<Picks>({});
  /** False until the saved map has been read, so the empty first render never overwrites it. */
  const [restored, setRestored] = useState(false);
  const [view, setView] = useState<View>(map.archived && called ? 'final' : 'play');
  /** A state's abbreviation, or the id of a district race, which has no shape of its own. */
  const [selected, setSelected] = useState('AR');

  useEffect(() => {
    fetch('/maps/national.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((doc: Shapes) => setShapes(doc))
      .catch(() => setFailed(true));
  }, []);

  // Storage can be missing or refuse (a private window): the map then simply is not kept.
  useEffect(() => {
    try {
      setPicks(validPicks(map, JSON.parse(window.localStorage.getItem(storageKey(map)) ?? 'null')));
    } catch {
      /* nothing saved that can be read */
    }
    setRestored(true);
  }, [map]);
  useEffect(() => {
    if (!restored) return;
    try {
      if (Object.keys(picks).length) window.localStorage.setItem(storageKey(map), JSON.stringify(picks));
      else window.localStorage.removeItem(storageKey(map));
    } catch {
      /* not kept */
    }
  }, [map, picks, restored]);

  const byState = useMemo(() => new Map(map.races.filter((r) => r.district === null).map((r) => [r.state, r])), [map]);
  const byId = useMemo(() => new Map(map.races.map((r) => [r.id, r])), [map]);
  /** Maine and Nebraska on the presidential map: the statewide votes and each district. */
  const units = useMemo(() => {
    const split = new Set(map.races.filter((r) => r.district !== null).map((r) => r.state));
    return map.races.filter((r) => split.has(r.state));
  }, [map]);
  const seats = useMemo(() => stateSeats(map, picks, view), [map, picks, view]);
  const counts = tally(map, picks, view);
  const now = useMemo(() => standing(map), [map]);
  const moved = changed(map, picks);

  const select = (race: Race) => setSelected(race.district === null ? race.state : race.id);
  const pick = (race: Race, key: string) => {
    setPicks((p) => ({ ...p, [race.id]: key }));
    select(race);
  };
  /** A click on a race: change its winner on the play view, otherwise just select it. */
  const press = (race: Race | undefined, fallback: string) => {
    if (race && view === 'play') pick(race, nextKey(race, picks[race.id] ?? race.start));
    else if (race) select(race);
    else setSelected(fallback);
  };

  const views: { key: View; label: string }[] = [
    { key: 'play', label: 'Play it out' },
    ...(president ? [] : [{ key: 'full' as const, label: map.office === 'senate' ? 'Full Senate' : 'All Governors' }]),
    ...(called ? [{ key: 'final' as const, label: 'Final result' }] : []),
  ];
  const pct = (n: number) => `${(100 * n) / map.total}%`;
  const race = byId.get(selected) ?? byState.get(selected);
  const current = race ? chosen(race, picks, view) : null;

  let about: string;
  if (race && view === 'play') {
    const { holder } = race;
    about = president
      ? `${race.weight} electoral vote${race.weight === 1 ? '' : 's'} · ${SIDE_WORD[holder.party]} in 2024`
      : `Held by ${holder.name ?? (holder.party === 'U' ? 'no one (vacant)' : `a ${holder.party === 'D' ? 'Democrat' : holder.party === 'R' ? 'Republican' : 'third party or independent'}`)}${race.special ? ' · special election' : ''}`;
  } else if (race && race.district !== null) {
    about = `${seatWords(map, [chosen(race, picks, view).party], view)}.`;
  } else {
    about = `${seatWords(map, view === 'play' ? undefined : seats.get(selected), view)}.`;
  }

  return (
    <main className="px-4 md:px-7 pt-7 pb-12 flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5 min-w-0">
          <p className="m-0 text-label font-semibold uppercase text-navy">
            Elections / {map.cycle} / {OFFICE_LABEL[map.office]}
          </p>
          <h1 className="m-0 flex flex-wrap items-center gap-3 text-[28px] md:text-[32px] leading-tight font-bold text-ink">
            {map.cycle} {TITLE[map.office]}
            {map.archived && (
              <span className="text-label font-semibold uppercase px-2 py-1 rounded-chip bg-lockBg text-ink2">Archived</span>
            )}
          </h1>
        </div>
        {cycles.length > 1 && (
          <nav aria-label="Election year" className="flex border border-rule rounded-ctl overflow-hidden">
            {cycles.map((c) => (
              <a key={c.label} href={c.href} aria-current={c.active ? 'page' : undefined} className={`${segment(Boolean(c.active))} inline-flex items-center`}>
                {c.label}
              </a>
            ))}
          </nav>
        )}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule">
        <nav aria-label="Race" className="flex flex-wrap gap-1">
          {offices.map((o) =>
            o.soon ? (
              <span key={o.label} className="inline-flex items-center gap-2 min-h-[44px] px-4 text-[15px] text-ink3 border-b-[3px] border-transparent">
                {o.label}
                <span className="text-micro font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-chip bg-lockBg text-ink2">Soon</span>
              </span>
            ) : (
              <a
                key={o.label}
                href={o.href}
                aria-current={o.active ? 'page' : undefined}
                className={`inline-flex items-center min-h-[44px] px-4 text-[15px] border-b-[3px] ${
                  o.active ? 'font-semibold text-ink border-navy' : 'text-ink2 border-transparent hover:text-ink'
                }`}
              >
                {o.label}
              </a>
            ),
          )}
        </nav>
        {views.length > 1 && (
          <div role="group" aria-label="View" className="flex border border-rule rounded-full overflow-hidden mb-2">
            {views.map((v) => (
              <button key={v.key} type="button" aria-pressed={view === v.key} onClick={() => setView(v.key)} className={segment(view === v.key)}>
                {v.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <section aria-label="Count" className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="m-0 flex items-baseline gap-2 text-party-d">
            <span className="text-[40px] leading-none font-bold tnum">{counts.D}</span>
            <span className="text-base font-semibold">Democratic</span>
          </p>
          <p className="m-0 flex flex-col items-center gap-0.5 text-center">
            <span className="text-base font-semibold text-ink">{control(map, counts)}</span>
            <span className="text-meta text-ink2">
              {president ? '270 electoral votes to win' : map.majority ? `${map.majority} seats for a majority` : `${map.races.length} states on the ballot`}
            </span>
          </p>
          <p className="m-0 flex items-baseline gap-2 text-party-r">
            <span className="text-base font-semibold">Republican</span>
            <span className="text-[40px] leading-none font-bold tnum">{counts.R}</span>
          </p>
        </div>
        <div
          className="relative h-[22px] rounded-chip overflow-hidden flex bg-lockBg"
          role="img"
          aria-label={`Democratic ${counts.D}, Republican ${counts.R}, other ${counts.I}, ${view === 'final' ? 'not called' : 'undecided'} ${counts.U}`}
        >
          {(['D', 'I', 'U', 'R'] as const).map((s) => (
            <div key={s} style={{ width: pct(counts[s]), background: SIDE_FILL[s] }} />
          ))}
          {map.majority && <div className="absolute left-1/2 inset-y-0 w-0.5 bg-ink" />}
        </div>
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-body text-ink2">
          <span>
            Other: <strong className="text-party-i">{counts.I}</strong> · {view === 'final' ? 'Not called' : 'Undecided'}:{' '}
            <strong className="text-ink">{counts.U}</strong>
          </span>
          <span>
            Change: D {signed(counts.D - now.D)}, R {signed(counts.R - now.R)}
          </span>
        </div>
      </section>

      <p className="m-0 px-[18px] py-3 bg-card border border-rule rounded-card text-base text-ink">
        <span className="mr-2.5 text-label font-semibold uppercase text-ink2">{NOW[map.office]}</span>
        <strong>{control(map, now)}</strong> · {now.D} D · {now.R} R{now.U ? ` · ${now.U} vacant` : ''}
      </p>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-3">
          <div className="bg-card border border-rule rounded-card p-3">
            {failed ? (
              <p className="m-0 py-24 text-center text-base text-ink2">The map could not be loaded.</p>
            ) : !shapes ? (
              <p className="m-0 py-24 text-center text-base text-ink2">Loading the map…</p>
            ) : (
              <svg viewBox={`0 0 ${shapes.w} ${shapes.h}`} className="block w-full h-auto" role="group" aria-label="Map of the United States">
                <defs>
                  {PAIRS.map(([a, b]) => (
                    <pattern key={a + b} id={`stripe-${a}${b}`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <rect width="10" height="10" fill={SIDE_FILL[a]} />
                      <rect width="5" height="10" fill={SIDE_FILL[b]} />
                    </pattern>
                  ))}
                </defs>
                {shapes.states.map((s) => {
                  const here = seats.get(s.abbr);
                  const isSelected = s.abbr === selected;
                  return (
                    <path
                      key={s.abbr}
                      d={s.d}
                      role="button"
                      tabIndex={0}
                      aria-label={`${s.name}: ${seatWords(map, here, view)}`}
                      aria-pressed={isSelected}
                      onClick={() => press(byState.get(s.abbr), s.abbr)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          press(byState.get(s.abbr), s.abbr);
                        }
                      }}
                      fill={fillOf(here)}
                      stroke={isSelected ? '#1A1A19' : here ? '#FDFDFC' : '#CCD1D5'}
                      strokeWidth={isSelected ? 2.5 : 1}
                      strokeLinejoin="round"
                      className="cursor-pointer outline-none focus-visible:stroke-ink focus-visible:[stroke-width:2.5]"
                    />
                  );
                })}
              </svg>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-meta text-ink2">{units.length ? 'Small states and districts:' : 'Small states:'}</span>
            {SMALL.filter((abbr) => seats.get(abbr)?.length).map((abbr) => (
              <button
                key={abbr}
                type="button"
                aria-label={`${STATE_NAMES[abbr] ?? 'District of Columbia'}: ${seatWords(map, seats.get(abbr), view)}`}
                onClick={() => press(byState.get(abbr), abbr)}
                style={chipStyle(seats.get(abbr) ?? [])}
                className={`min-w-[44px] min-h-[44px] px-2 rounded-ctl border-2 text-[13px] font-semibold cursor-pointer ${
                  abbr === selected ? 'border-ink' : 'border-transparent'
                }`}
              >
                {abbr}
              </button>
            ))}
            {units.map((unit) => {
              const side = chosen(unit, picks, view).party;
              return (
                <button
                  key={unit.id}
                  type="button"
                  aria-label={`${unit.district === null ? `${unit.label}, statewide` : unit.label}: ${seatWords(map, [side], view)}`}
                  onClick={() => press(unit, unit.state)}
                  style={chipStyle([side])}
                  className={`min-w-[44px] min-h-[44px] px-2 rounded-ctl border-2 text-[13px] font-semibold cursor-pointer ${
                    (unit.district === null ? unit.state : unit.id) === selected ? 'border-ink' : 'border-transparent'
                  }`}
                >
                  {unit.district === null ? unit.state : `${unit.state}-${unit.district}`}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <ul className="m-0 p-0 list-none flex flex-wrap gap-x-3.5 gap-y-1 text-meta text-ink2">
              {(['D', 'R', 'I', 'U'] as const).map((s) => (
                <li key={s} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="w-3 h-3 rounded-[2px]" style={{ background: SIDE_FILL[s] }} />
                  {s === 'U' && view === 'final' ? 'Not called' : SIDE_WORD[s]}
                </li>
              ))}
              {!president && (
                <li className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="w-3 h-3 rounded-[2px] border border-lockRule" style={{ background: OFF }} />
                  Not on the ballot
                </li>
              )}
              {map.office === 'senate' && view !== 'play' && (
                <li className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="w-3 h-3 rounded-[2px]" style={chipStyle(['D', 'R'])} />
                  Split
                </li>
              )}
            </ul>
            {view === 'play' && (
              <div className="flex gap-2">
                <button type="button" onClick={() => setPicks({})} className="min-h-[44px] px-3.5 bg-card border border-rule rounded-ctl text-[14px] font-semibold text-ink cursor-pointer hover:border-ink3">
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setPicks(Object.fromEntries(map.races.map((r) => [r.id, 'U'])))}
                  className="min-h-[44px] px-3.5 bg-card border border-rule rounded-ctl text-[14px] font-semibold text-ink cursor-pointer hover:border-ink3"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          <p className="m-0 text-body text-ink2">
            {view === 'play'
              ? `Starts from ${president ? 'the 2024 result' : 'who holds each seat'}. Click a state to change its winner. Your map is saved in this browser.${moved ? ` ${moved} changed.` : ''}`
              : view === 'full'
                ? 'Every state after your picks, seats not on the ballot included.'
                : `${called} of ${map.races.length} races called.`}
          </p>
        </div>

        <aside className="flex-[1_1_300px] min-w-0 bg-card border border-rule rounded-card p-[18px] flex flex-col gap-3">
          <h2 className="m-0 text-stat font-semibold text-ink">
            {president
              ? race
                ? `${race.label}${race.district === null && units.some((u) => u.state === race.state) ? ', statewide' : ''}`
                : selected
              : `${STATE_NAMES[selected] ?? selected} ${OFFICE_LABEL[map.office]}`}
          </h2>
          <p className="m-0 text-body text-ink2">{about}</p>
          {race && view === 'play' && (
            <div className="flex flex-col gap-2">
              {race.choices.map((c) => {
                const on = current?.key === c.key || (current?.key === HOLD && c.party === current.party && c.countAs === current.countAs);
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pick(race, c.key)}
                    className={`min-h-[48px] px-3 py-2 flex items-center gap-2.5 text-left rounded-ctl border-2 cursor-pointer ${
                      on ? 'border-ink bg-canvas' : 'border-rule bg-card hover:border-ink3'
                    }`}
                  >
                    <span aria-hidden className="w-3.5 h-3.5 rounded-full flex-none" style={{ background: SIDE_FILL[c.party] }} />
                    <span className="flex flex-col">
                      <span className="text-base font-semibold text-ink">{c.label}</span>
                      {c.sub && <span className="text-meta text-ink2">{c.sub}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {race && view === 'final' && (
            <p className="m-0 text-base text-ink">
              {race.result ? (
                <>
                  <strong>{chosen(race, picks, 'final').label}</strong>
                  {race.calledOn ? ` · called ${race.calledOn}` : ''}
                  {race.note ? ` · ${race.note}` : ''}
                </>
              ) : (
                'Not called yet.'
              )}
            </p>
          )}
          {race &&
            [{ label: race.holder.name, href: race.holder.href }, ...race.choices]
              .filter((c, i, all) => c.href && all.findIndex((o) => o.href === c.href) === i)
              .map((c) => (
                <a key={c.href} href={c.href ?? '#'} className="text-[14px] font-semibold text-navy hover:text-ink">
                  {c.label}&apos;s profile →
                </a>
              ))}
        </aside>
      </div>
    </main>
  );
}
