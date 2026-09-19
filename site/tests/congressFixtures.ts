/** GET /api/v1/congress/overview, trimmed from what the local marts returned on 2026-09-19. */
import type { CongressOverviewResponse, PassedBothItem } from '@/lib/types';

const CG = 'https://www.congress.gov/bill/119th-congress';

export const HR1: PassedBothItem = {
  congress: 119,
  bill_type: 'hr',
  bill_number: '1',
  label: 'H.R. 1',
  title: 'An act to provide for reconciliation pursuant to title II of H. Con. Res. 14',
  outcome: 'law',
  public_law_number: '119-21',
  outcome_date: '2025-07-04',
  house_yea: 215,
  house_nay: 214,
  senate_yea: 50,
  senate_nay: 50,
  congress_gov_url: `${CG}/house-bill/1`,
};

export const PASSED_ITEMS: PassedBothItem[] = [
  {
    congress: 119,
    bill_type: 's',
    bill_number: '4530',
    label: 'S. 4530',
    title:
      'A bill to amend chapters 83 and 84 of title 5, United States Code, to authorize an increase of the retirement age for members of the Capitol Police.',
    outcome: 'law',
    public_law_number: '119-95',
    outcome_date: '2026-05-29',
    house_yea: null,
    house_nay: null,
    senate_yea: null,
    senate_nay: null,
    congress_gov_url: `${CG}/senate-bill/4530`,
  },
  {
    congress: 119,
    bill_type: 's',
    bill_number: '4465',
    label: 'S. 4465',
    title: 'A bill to amend the FISA Amendments Act of 2008 to extend the authorities of title VII.',
    outcome: 'law',
    public_law_number: '119-87',
    outcome_date: '2026-04-30',
    house_yea: 261,
    house_nay: 111,
    senate_yea: null,
    senate_nay: null,
    congress_gov_url: `${CG}/senate-bill/4465`,
  },
  {
    congress: 119,
    bill_type: 'hr',
    bill_number: '4405',
    label: 'H.R. 4405',
    title: 'Epstein Files Transparency Act',
    outcome: 'law',
    public_law_number: '119-38',
    outcome_date: '2025-11-19',
    house_yea: 427,
    house_nay: 1,
    senate_yea: null,
    senate_nay: null,
    congress_gov_url: `${CG}/house-bill/4405`,
  },
];

/** The three concurrent resolutions that cleared both chambers; none goes to the President. */
const ADOPTED: PassedBothItem[] = [
  ['H.Con.Res. 73', '73', 'hconres', '2026-05-12'],
  ['S.Con.Res. 12', '12', 'sconres', '2025-05-08'],
  ['H.Con.Res. 9', '9', 'hconres', '2025-04-30'],
].map(([label, number, type, date]) => ({
  congress: 119,
  bill_type: type,
  bill_number: number,
  label,
  title: `Concurrent resolution ${label}`,
  outcome: 'adopted' as const,
  public_law_number: null,
  outcome_date: date,
  house_yea: null,
  house_nay: null,
  senate_yea: null,
  senate_nay: null,
  congress_gov_url: `${CG}/${type === 'hconres' ? 'house' : 'senate'}-concurrent-resolution/${number}`,
}));

const BOTH: PassedBothItem[] = [
  PASSED_ITEMS[0],
  ADOPTED[0],
  PASSED_ITEMS[1],
  PASSED_ITEMS[2],
  ...ADOPTED.slice(1),
  HR1,
];

export const OVERVIEW: CongressOverviewResponse = {
  congress: 119,
  congress_start: '2025-01-03',
  congress_end: '2027-01-03',
  composition: {
    as_of: '2026-09-19',
    seats: 535,
    seated: 533,
    vacant: 2,
    chambers: [
      {
        chamber: 'house',
        seats: 435,
        seated: 433,
        vacant: 2,
        majority_threshold: 218,
        majority_pct: 50.11,
        republican_caucus: 219,
        democratic_caucus: 214,
        majority_party: 'republican',
        majority_letter: 'R',
        majority_margin: 5,
        groups: [
          { party_group: 'republican', label: 'Republican', seats: 218, seat_pct: 50.11, caucus_with: null },
          { party_group: 'democratic', label: 'Democratic', seats: 214, seat_pct: 49.2, caucus_with: null },
          { party_group: 'independent', label: 'Independent', seats: 1, seat_pct: 0.23, caucus_with: 'republican' },
          { party_group: 'vacant', label: 'Vacant', seats: 2, seat_pct: 0.46, caucus_with: null },
        ],
        source_url: 'https://clerk.house.gov/Members',
      },
      {
        chamber: 'senate',
        seats: 100,
        seated: 100,
        vacant: 0,
        majority_threshold: 51,
        majority_pct: 51,
        republican_caucus: 53,
        democratic_caucus: 47,
        majority_party: 'republican',
        majority_letter: 'R',
        majority_margin: 6,
        groups: [
          { party_group: 'republican', label: 'Republican', seats: 53, seat_pct: 53, caucus_with: null },
          { party_group: 'democratic', label: 'Democratic', seats: 45, seat_pct: 45, caucus_with: null },
          { party_group: 'independent', label: 'Independent', seats: 2, seat_pct: 2, caucus_with: 'democratic' },
        ],
        source_url: 'https://www.senate.gov/senators/',
      },
    ],
  },
  activity: {
    tracked_members: 20,
    tracked_house: 10,
    tracked_senate: 10,
    bills_introduced: 702,
    introduced_house: 257,
    introduced_senate: 445,
    passed_chamber: 45,
    passed_chamber_house_origin: 22,
    passed_chamber_senate_origin: 23,
    became_law: 3,
    became_law_pct: 0.4,
    vetoed: 0,
    vetoed_overridden: 0,
    vetoed_not_overridden: 0,
  },
  passed_both: { bills_in_dataset: 3922, total: 7, enacted: 4, adopted: 3, vetoed: 0, items: BOTH },
  generated_at: '2026-09-19T16:00:00Z',
  sources: [],
};

/** Ten measures, including a veto and an override, to exercise the eight-row cut. */
export function manyPassed(): CongressOverviewResponse {
  const extra: PassedBothItem[] = Array.from({ length: 4 }, (_, i) => ({
    ...PASSED_ITEMS[2],
    bill_number: String(100 + i),
    label: `H.R. ${100 + i}`,
    title: `Extra measure ${i}`,
    outcome: i === 0 ? 'overridden' : i === 1 ? 'vetoed' : 'law',
    public_law_number: i < 2 ? null : `119-${20 + i}`,
    outcome_date: '2026-06-01',
    senate_yea: 74,
    senate_nay: 25,
  }));
  return {
    ...OVERVIEW,
    passed_both: {
      bills_in_dataset: 3922,
      total: 11,
      enacted: 6,
      adopted: 3,
      vetoed: 2,
      items: [...BOTH, ...extra],
    },
  };
}
