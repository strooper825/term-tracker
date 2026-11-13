import { describe, expect, it } from 'vitest';
import {
  billEntries,
  billHits,
  indexSeats,
  memberHits,
  partyLetter,
  search,
  senateFill,
  stripeId,
  toMapSeat,
} from '@/lib/seats';
import type { BillListItem, SeatHolder } from '@/lib/types';

function seat(overrides: Partial<SeatHolder>): SeatHolder {
  return {
    seat_key: 'house-WI-1',
    chamber: 'house',
    state: 'WI',
    state_name: 'Wisconsin',
    district: 1,
    senate_class: null,
    state_rank: null,
    bioguide_id: 'S001213',
    name: 'Bryan Steil',
    last_name: 'Steil',
    party: 'Republican',
    caucus: null,
    is_tracked: true,
    photo_url: 'https://www.congress.gov/img/member/s001213_200.jpg',
    website_url: 'https://steil.house.gov',
    ...overrides,
  };
}

const STEIL = seat({});
const POCAN = seat({
  seat_key: 'house-WI-2',
  district: 2,
  bioguide_id: 'P000607',
  name: 'Mark Pocan',
  last_name: 'Pocan',
  party: 'Democrat',
  is_tracked: false,
  website_url: 'https://pocan.house.gov',
});
const SANDERS = seat({
  seat_key: 'senate-VT-1',
  chamber: 'senate',
  state: 'VT',
  state_name: 'Vermont',
  district: null,
  senate_class: 1,
  state_rank: 'senior',
  bioguide_id: 'S000033',
  name: 'Bernard Sanders',
  party: 'Independent',
  caucus: 'Democrat',
  is_tracked: true,
});
const WELCH = seat({
  seat_key: 'senate-VT-3',
  chamber: 'senate',
  state: 'VT',
  state_name: 'Vermont',
  district: null,
  senate_class: 3,
  state_rank: 'junior',
  bioguide_id: 'W000800',
  name: 'Peter Welch',
  party: 'Democrat',
  is_tracked: false,
  website_url: null,
});
const NORTON = seat({
  seat_key: 'house-DC-0',
  state: 'DC',
  state_name: 'District of Columbia',
  district: 0,
  bioguide_id: 'N000147',
  name: 'Eleanor Holmes Norton',
  party: 'Democrat',
  is_tracked: false,
});
const PR = seat({
  seat_key: 'house-PR-0',
  state: 'PR',
  state_name: 'Puerto Rico',
  district: 0,
  bioguide_id: 'H001103',
  name: 'Pablo José Hernández Rivera',
  party: 'Democrat',
  is_tracked: false,
});
const AK = seat({ seat_key: 'house-AK-0', state: 'AK', state_name: 'Alaska', district: 0, bioguide_id: 'B001323', name: 'Nicholas Begich', is_tracked: false });

describe('partyLetter', () => {
  it.each([
    ['Republican', 'R'],
    ['Democrat', 'D'],
    ['Democratic', 'D'],
    ['Independent', 'I'],
    ['Libertarian', 'I'],
    [null, 'V'],
  ])('%s -> %s', (party, letter) => expect(partyLetter(party)).toBe(letter));
});

describe('toMapSeat', () => {
  it('links a tracked member to their dashboard', () => {
    expect(toMapSeat(STEIL)).toMatchObject({
      href: '/members/S001213',
      external: false,
      seatLabel: 'District 1',
      shortLabel: 'WI-1',
      party: 'R',
    });
  });

  it('links an untracked member to their official website, or Bioguide without one', () => {
    expect(toMapSeat(POCAN)).toMatchObject({ href: 'https://pocan.house.gov', external: true });
    expect(toMapSeat(WELCH)).toMatchObject({
      href: 'https://bioguide.congress.gov/search/bio/W000800',
      external: true,
      seatLabel: 'Junior senator',
    });
  });

  it('labels at-large seats, delegates and the Resident Commissioner', () => {
    expect(toMapSeat(AK)).toMatchObject({ seatLabel: 'At-large district', shortLabel: 'AK at-large', district: 0 });
    expect(toMapSeat(NORTON)).toMatchObject({ seatLabel: 'Delegate', shortLabel: 'DC delegate' });
    expect(toMapSeat(PR).seatLabel).toBe('Resident Commissioner');
  });

  it('notes which party an independent caucuses with', () => {
    expect(toMapSeat(SANDERS)).toMatchObject({ party: 'I', partyNote: 'Caucuses with the Democrats' });
  });
});

describe('indexSeats and senateFill', () => {
  const index = indexSeats([STEIL, POCAN, SANDERS, WELCH, NORTON, PR, AK].map(toMapSeat));

  it('keys House seats by state and district and lists territories apart from DC', () => {
    expect(index.house.get('WI-2')?.name).toBe('Mark Pocan');
    expect(index.house.get('DC-0')?.name).toBe('Eleanor Holmes Norton');
    expect(index.territories.map((s) => s.state)).toEqual(['PR']);
  });

  it('puts the senior senator first', () => {
    expect(index.senate.get('VT')?.map((s) => s.name)).toEqual(['Bernard Sanders', 'Peter Welch']);
  });

  it('fills a state one color when both senators agree, striped when they split', () => {
    expect(senateFill(index.senate.get('VT'), 'VT')).toEqual(['D', 'I']);
    expect(stripeId(['D', 'I'])).toBe('stripe-D-I');
    const both = indexSeats([SANDERS, { ...SANDERS, seat_key: 'senate-VT-3', bioguide_id: 'X' }].map(toMapSeat));
    expect(senateFill(both.senate.get('VT'), 'VT')).toEqual(['I']);
  });

  it('counts an empty seat as vacant and gives DC no Senate fill', () => {
    const one = indexSeats([WELCH].map(toMapSeat));
    expect(senateFill(one.senate.get('VT'), 'VT')).toEqual(['D', 'V']);
    expect(senateFill(undefined, 'OH')).toEqual(['V']);
    expect(senateFill(undefined, 'DC')).toBeNull();
  });
});

describe('search', () => {
  const members = memberHits([STEIL, POCAN, SANDERS, WELCH].map(toMapSeat));

  it('finds members by name, state or seat', () => {
    expect(search(members, 'steil').map((h) => h.name)).toEqual(['Bryan Steil']);
    expect(search(members, 'wisconsin').map((h) => h.name)).toEqual(['Bryan Steil', 'Mark Pocan']);
    expect(search(members, 'vermont senator').map((h) => h.name)).toEqual(['Bernard Sanders', 'Peter Welch']);
    expect(search(members, 'WI-2').map((h) => h.name)).toEqual(['Mark Pocan']);
    expect(search(members, '   ')).toEqual([]);
  });

  it('describes each member by party and seat', () => {
    expect(members.find((h) => h.name === 'Bryan Steil')?.detail).toBe('Republican · WI-1');
    expect(members.find((h) => h.name === 'Peter Welch')?.detail).toBe('Democratic · Vermont senator');
  });

  const bill = (bill_type: string, bill_number: string, label: string, title: string) =>
    ({ congress: 119, bill_type, bill_number, label, title }) as BillListItem;
  const bills = billHits(
    billEntries([
      bill('hr', '10', 'H.R. 10', 'Another act'),
      bill('hr', '1', 'H.R. 1', 'One Big Act'),
      bill('s', '12', 'S. 12', 'Farm act'),
      bill('hjres', '1', 'H.J.Res. 1', 'A joint resolution'),
    ]),
  );

  it('puts the exact bill number first, however it is typed', () => {
    for (const query of ['H.R. 1', 'hr1', 'HR 1', 'h.r.1']) {
      expect(search(bills, query)[0].label, query).toBe('H.R. 1');
    }
    expect(search(bills, 'hjres1')[0].href).toBe('/bills/119/hjres/1');
  });

  it('finds bills by a word of the title', () => {
    expect(search(bills, 'farm').map((b) => b.label)).toEqual(['S. 12']);
  });
});
