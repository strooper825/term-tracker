import { describe, expect, it } from 'vitest';
import {
  HOLD,
  buildElectionMap,
  changed,
  chosen,
  control,
  freezeHolders,
  nextKey,
  standing,
  stateSeats,
  stripeOf,
  tally,
  validPicks,
  type ElectionFile,
  type Picks,
} from '@/lib/elections';
import { listElectionMaps, loadElectionFile, loadElectionMap, mapHref } from '@/lib/electionsContent';
import { FIXTURES, SENATORS } from './electionFixtures';

const senate = () => buildElectionMap(2026, 'senate', loadElectionFile(2026, 'senate', FIXTURES), SENATORS);
const governor = () => buildElectionMap(2026, 'governor', loadElectionFile(2026, 'governor', FIXTURES), []);
const flip = (map: ReturnType<typeof senate>, states: string[], key: string): Picks =>
  Object.fromEntries(states.map((s) => [map.races.find((r) => r.state === s)!.id, key]));

describe('the election files', () => {
  it('lists a map per file, with a permanent address', () => {
    const maps = listElectionMaps(FIXTURES);
    expect(maps).toContainEqual({ cycle: 2026, office: 'senate' });
    expect(maps).toContainEqual({ cycle: 2026, office: 'governor' });
    // newest cycle first, offices in menu order
    expect(maps.slice(0, 3)).toEqual([
      { cycle: 2028, office: 'president' },
      { cycle: 2028, office: 'senate' },
      { cycle: 2028, office: 'governor' },
    ]);
    expect(mapHref({ cycle: 2026, office: 'senate' })).toBe('/elections/2026/senate');
  });

  it('2026 Senate: 35 races, the other 65 seats from the seat data, and today is 47 to 53', () => {
    const map = senate();
    expect(map.races).toHaveLength(35);
    expect(map.others).toHaveLength(65);
    expect(map.races.filter((r) => r.special).map((r) => r.state)).toEqual(['FL', 'OH']);
    // King and Sanders are independents and count with the Democrats
    expect(standing(map)).toEqual({ D: 47, R: 53, I: 0, U: 0 });
    expect(control(map, standing(map))).toBe('Republican majority');
    expect(new Set(map.races.map((r) => r.id)).size).toBe(35);
  });

  it('2026 Governor: 36 races and 14 others make fifty, 24 to 26', () => {
    const map = governor();
    expect(map.races).toHaveLength(36);
    expect(map.others).toHaveLength(14);
    expect(new Set([...map.races, ...map.others].map((s) => s.state)).size).toBe(50);
    expect(standing(map)).toEqual({ D: 24, R: 26, I: 0, U: 0 });
    expect(control(map, standing(map))).toBe('More Republican Governors');
    expect(map.majority).toBeNull();
  });
});

describe('counting a map', () => {
  it('the untouched map is the Senate as it stands', () => {
    const map = senate();
    expect(tally(map, {}, 'play')).toEqual(standing(map));
    expect(changed(map, {})).toBe(0);
  });

  it('three flips tie the Senate and a fourth gives a majority', () => {
    const map = senate();
    const three = flip(map, ['NC', 'ME', 'OH'], 'D');
    expect(tally(map, three, 'play')).toMatchObject({ D: 50, R: 50 });
    expect(control(map, tally(map, three, 'play'))).toBe('Tied 50 to 50');
    const four = { ...three, ...flip(map, ['TX'], 'D') };
    expect(control(map, tally(map, four, 'play'))).toBe('Democratic majority');
    expect(changed(map, four)).toBe(4);
  });

  it('an undecided race leaves no majority, and a third-party win counts as other', () => {
    const map = senate();
    const picks = { ...flip(map, ['NC', 'ME', 'OH'], 'U'), ...flip(map, ['TX'], 'I') };
    expect(tally(map, picks, 'play')).toEqual({ D: 47, R: 49, I: 1, U: 3 });
    expect(control(map, tally(map, picks, 'play'))).toBe('No majority yet');
  });

  it('a click cycles Democratic, Republican, other, undecided from the holder', () => {
    const race = senate().races.find((r) => r.state === 'AR')!;
    expect(race.start).toBe(HOLD);
    expect(chosen(race, {}, 'play')).toMatchObject({ party: 'R', label: 'Tom Cotton', href: '/members/C001095' });
    const keys = [race.start];
    for (let i = 0; i < 4; i += 1) keys.push(nextKey(race, keys[keys.length - 1]));
    expect(keys).toEqual([HOLD, 'I', 'U', 'D', 'R']);
  });

  it('the full view shows both seats: Maine is Collins and an independent, purple and striped', () => {
    const map = senate();
    expect(stateSeats(map, {}, 'play').get('ME')).toEqual(['R']);
    expect(stateSeats(map, {}, 'full').get('ME')).toEqual(['R', 'I']);
    expect(stripeOf(['R', 'I'])).toEqual(['I', 'R']);
    expect(stateSeats(map, {}, 'full').get('AR')).toEqual(['R', 'R']);
    expect(stripeOf(['R', 'R'])).toEqual(['R', 'R']);
    // Pennsylvania has no race in 2026: nothing on the play map, both senators on the full one
    expect(stateSeats(map, {}, 'play').get('PA')).toBeUndefined();
    expect(stateSeats(map, {}, 'full').get('PA')?.sort()).toEqual(['D', 'R']);
  });
});

describe('candidates and results', () => {
  const file = (race: object): ElectionFile => ({ races: [{ state: 'AR', seatClass: 2, ...race }] });
  const build = (race: object) => buildElectionMap(2026, 'senate', file(race), SENATORS).races[0];

  it('a race with candidates offers them, starts on the incumbent and links a member with a profile', () => {
    const race = build({
      candidates: [
        { name: 'Tom Cotton', party: 'Republican', member: 'C001095' },
        { name: 'A Challenger', party: 'Democratic', member: 'XAZ1' },
        { name: 'An Independent', party: 'Independent', caucus: 'Democratic' },
        { name: 'A Libertarian', party: 'Libertarian' },
      ],
    });
    expect(race.choices.map((c) => c.label)).toEqual(['Tom Cotton', 'A Challenger', 'An Independent', 'A Libertarian', 'Undecided']);
    expect(race.start).toBe('c-tom-cotton');
    expect(race.choices[0]).toMatchObject({ sub: 'Republican · incumbent', href: '/members/C001095', party: 'R' });
    // a member the site has no profile for is not a link
    expect(race.choices[1].href).toBeNull();
    // purple on the map, counted with the caucus
    expect(race.choices[2]).toMatchObject({ party: 'I', countAs: 'D', sub: 'Independent' });
    expect(race.choices[3]).toMatchObject({ party: 'I', countAs: 'I', sub: 'Libertarian' });
    expect(race.result).toBeNull();
  });

  it('the owner calls a race by marking the winner, or by party when no candidates are entered', () => {
    const named = build({ candidates: [{ name: 'A', party: 'Democratic', winner: true }, { name: 'B', party: 'Republican' }], calledOn: '2026-11-04' });
    expect(chosen(named, {}, 'final')).toMatchObject({ label: 'A', countAs: 'D' });
    expect(named.calledOn).toBe('2026-11-04');
    const byParty = build({ winnerParty: 'Democratic' });
    expect(chosen(byParty, {}, 'final').countAs).toBe('D');
    const independent = build({ winnerParty: 'Independent', winnerCaucus: 'Republican' });
    expect(chosen(independent, {}, 'final')).toMatchObject({ party: 'I', countAs: 'R' });
    expect(chosen(build({}), {}, 'final').party).toBe('U');
  });

  it('the final view counts only called races; the rest are not called', () => {
    const map = buildElectionMap(
      2026,
      'senate',
      { races: [{ state: 'AR', seatClass: 2, winnerParty: 'Democratic' }, { state: 'TX', seatClass: 2 }] },
      SENATORS,
    );
    expect(tally(map, {}, 'final')).toEqual({ D: 48, R: 51, I: 0, U: 1 });
  });

  it('the file overrides the seat data, which is how a vacancy is recorded', () => {
    expect(build({ holder: { party: 'Vacant' } }).holder).toMatchObject({ party: 'U', countAs: 'U' });
    expect(build({}).holder).toMatchObject({ party: 'R', name: 'Tom Cotton' });
  });

  it('a file that contradicts itself fails the build', () => {
    expect(() => build({ candidates: [{ name: 'A', winner: true }, { name: 'B', winner: true }] })).toThrow(/more than one winner/);
    expect(() => buildElectionMap(2026, 'senate', { races: [{ state: 'ZZ', seatClass: 2 }] }, [])).toThrow(/not a state/);
    expect(() => buildElectionMap(2026, 'senate', { races: [{ state: 'AR' }] }, [])).toThrow(/seatClass/);
    expect(() => buildElectionMap(2026, 'governor', { races: [{ state: 'AR' }] }, [])).toThrow(/needs a holder/);
    expect(() =>
      buildElectionMap(2026, 'governor', { races: [{ state: 'AR', holder: { party: 'Republican' } }, { state: 'AR', holder: { party: 'Republican' } }] }, []),
    ).toThrow(/two races/);
  });
});

describe('2028', () => {
  const president = () => loadElectionMap({ cycle: 2028, office: 'president' }, SENATORS, FIXTURES);
  const idOf = (map: ReturnType<typeof president>, seat: string) => map.races.find((r) => r.seat === seat)!.id;

  it('President: 538 electoral votes over 56 units, starting from 2024', () => {
    const map = president();
    expect(map.races).toHaveLength(56);
    expect(map.races.reduce((n, r) => n + r.weight, 0)).toBe(538);
    expect(standing(map)).toEqual({ D: 226, R: 312, I: 0, U: 0 });
    expect(control(map, standing(map))).toBe('Republican win');
    expect(map.others).toEqual([]);
  });

  it('Maine and Nebraska split: two statewide votes and one per district', () => {
    const map = president();
    const unit = (seat: string) => map.races.find((r) => r.seat === seat)!;
    expect(unit('ME')).toMatchObject({ weight: 2, district: null, label: 'Maine' });
    expect(unit('ME-2')).toMatchObject({ weight: 1, district: 2, label: 'Maine 2nd District' });
    expect(unit('ME-2').holder.party).toBe('R');
    expect(unit('NE-2').holder.party).toBe('D');
    expect(unit('NE-3')).toMatchObject({ weight: 1, label: 'Nebraska 3rd District' });
    // a district is not the state: the shape follows the statewide votes only
    expect(stateSeats(map, { [unit('ME-2').id]: 'D', [unit('ME-1').id]: 'R' }, 'play').get('ME')).toEqual(['D']);
  });

  it('Pennsylvania, Michigan and Wisconsin make 270', () => {
    const map = president();
    const picks = Object.fromEntries(['PA', 'MI', 'WI'].map((s) => [idOf(map, s), 'D']));
    expect(tally(map, picks, 'play')).toMatchObject({ D: 270, R: 268 });
    expect(control(map, tally(map, picks, 'play'))).toBe('Democratic win');
    expect(control(map, { D: 269, R: 269, I: 0, U: 0 })).toBe('Tied 269 to 269');
    expect(control(map, { D: 260, R: 268, I: 0, U: 10 })).toBe('No winner yet');
  });

  it('the national candidates are offered in every state, and a state is called by party', () => {
    const file = loadElectionFile(2028, 'president', FIXTURES);
    file.candidates = [{ name: 'D Ticket', party: 'Democratic' }, { name: 'R Ticket', party: 'Republican' }];
    file.races!.find((r) => r.state === 'AR')!.winnerParty = 'Republican';
    const map = buildElectionMap(2028, 'president', file, []);
    const arkansas = map.races.find((r) => r.seat === 'AR')!;
    expect(arkansas.choices.map((c) => c.label)).toEqual(['D Ticket', 'R Ticket', 'Undecided']);
    expect(chosen(arkansas, {}, 'final').label).toBe('R Ticket');
    expect(tally(map, {}, 'final')).toEqual({ D: 0, R: 6, I: 0, U: 532 });
  });

  it('Senate and Governor with nothing called in 2026 start from today', () => {
    const senate = loadElectionMap({ cycle: 2028, office: 'senate' }, SENATORS, FIXTURES);
    // the 34 seats of Class 3 and the special election for Tennessee's Class 1 seat
    expect(senate.races).toHaveLength(35);
    expect(senate.others).toHaveLength(65);
    expect(senate.races.find((r) => r.special)).toMatchObject({ seat: 'TN-1', id: '2028-senate-tn-special' });
    expect(standing(senate)).toEqual({ D: 47, R: 53, I: 0, U: 0 });
    const governor = loadElectionMap({ cycle: 2028, office: 'governor' }, [], FIXTURES);
    expect(governor.races).toHaveLength(11);
    expect(governor.others).toHaveLength(39);
    expect(standing(governor)).toEqual({ D: 24, R: 26, I: 0, U: 0 });
  });

  it('a 2026 result becomes the 2028 starting map: seats not on the ballot and seats up again', () => {
    const file26 = loadElectionFile(2026, 'senate', FIXTURES);
    const call = (state: string, extra: object) => Object.assign(file26.races!.find((r) => r.state === state)!, extra);
    call('TX', { winnerParty: 'Democratic' }); // class 2: not on the 2028 ballot
    call('FL', { candidates: [{ name: 'New Senator', party: 'Democratic', winner: true }] }); // special for a class 3 seat
    const prior = buildElectionMap(2026, 'senate', file26, SENATORS);
    const map = buildElectionMap(2028, 'senate', loadElectionFile(2028, 'senate', FIXTURES), SENATORS, prior);
    expect(map.others.find((o) => o.seat === 'TX-2')).toMatchObject({ party: 'D', name: null });
    expect(map.races.find((r) => r.seat === 'FL-3')!.holder).toMatchObject({ party: 'D', name: 'New Senator' });
    expect(standing(map)).toEqual({ D: 49, R: 51, I: 0, U: 0 });
    // an uncalled 2026 race changes nothing: Arkansas is still its sitting senator
    expect(map.others.find((o) => o.seat === 'AR-2')).toMatchObject({ party: 'R', name: 'Tom Cotton' });

    const gov26 = loadElectionFile(2026, 'governor', FIXTURES);
    Object.assign(gov26.races!.find((r) => r.state === 'NH')!, { winnerParty: 'Democratic' });
    Object.assign(gov26.races!.find((r) => r.state === 'TX')!, { winnerParty: 'Democratic' });
    const governor = buildElectionMap(2028, 'governor', loadElectionFile(2028, 'governor', FIXTURES), [], buildElectionMap(2026, 'governor', gov26, []));
    expect(governor.races.find((r) => r.seat === 'NH')!.holder.party).toBe('D');
    expect(standing(governor)).toEqual({ D: 26, R: 24, I: 0, U: 0 });
    // the 2028 file can still override a state with no race: a vacancy, a succession
    const edited = buildElectionMap(2028, 'governor', { ...loadElectionFile(2028, 'governor', FIXTURES), others: [{ state: 'TX', party: 'Republican' }] }, [], buildElectionMap(2026, 'governor', gov26, []));
    expect(standing(edited)).toEqual({ D: 25, R: 25, I: 0, U: 0 });
    expect(control(edited, standing(edited))).toBe('Even split');
  });
});

describe('keeping a map', () => {
  it('a saved map keeps only picks the file still offers', () => {
    const map = buildElectionMap(2026, 'senate', loadElectionFile(2026, 'senate', FIXTURES), SENATORS);
    const [first, second] = map.races;
    expect(validPicks(map, { [first.id]: 'D', [second.id]: 'c-someone-removed', 'no-such-race': 'R', other: 3 })).toEqual({ [first.id]: 'D' });
    expect(validPicks(map, null)).toEqual({});
    expect(validPicks(map, 'nonsense')).toEqual({});
  });

  it('freezing writes each holder into the file and leaves an entered one alone', () => {
    const file = loadElectionFile(2026, 'senate', FIXTURES);
    file.races!.find((r) => r.state === 'AL')!.holder = { party: 'Vacant' };
    const frozen = freezeHolders(file, buildElectionMap(2026, 'senate', file, SENATORS));
    const holder = (state: string) => frozen.races!.find((r) => r.state === state)!.holder;
    expect(holder('AR')).toEqual({ party: 'Republican', name: 'Tom Cotton', member: 'C001095' });
    expect(holder('AL')).toEqual({ party: 'Vacant' });
    // with the holders in the file, the map no longer needs the seat data for its races
    const later = buildElectionMap(2026, 'senate', frozen, []);
    expect(later.races.find((r) => r.state === 'AR')!.holder).toMatchObject({ party: 'R', name: 'Tom Cotton' });
  });
});

describe("the owner's files in site/content", () => {
  // Whatever has been entered, each map must still build and still hold every race. Nothing
  // here may depend on which candidates or results are in the files.
  const RACES: Record<string, number> = { '2026/senate': 35, '2026/governor': 36, '2028/president': 56, '2028/senate': 35, '2028/governor': 11 };

  it('every map builds from the live files and keeps all its races', () => {
    const maps = listElectionMaps();
    expect(maps.map((m) => `${m.cycle}/${m.office}`).sort()).toEqual(Object.keys(RACES).sort());
    for (const ref of maps) {
      const map = loadElectionMap(ref, SENATORS);
      expect(map.races, `${ref.cycle} ${ref.office}`).toHaveLength(RACES[`${ref.cycle}/${ref.office}`]);
      expect(new Set(map.races.map((r) => r.id)).size).toBe(map.races.length);
      const seats = map.races.length + map.others.length;
      expect(seats, `${ref.cycle} ${ref.office}`).toBe(ref.office === 'president' ? 56 : map.total);
    }
  });
});
