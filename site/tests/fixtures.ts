/** Mart rows as the Phase 1d API returns them (values from the live database, 2026-09-12). */
import type {
  BillDetail,
  CommitteeAssignment,
  ConstituencyResponse,
  ContactResponse,
  CongressSession,
  FeedItem,
  FundraisingResponse,
  JourneyStage,
  KeyDate,
  MemberDetail,
  MemberIds,
  MemberListItem,
  StatementItem,
  StatementsResponse,
  TermHistoryItem,
  WeekBucket,
} from '@/lib/types';

const NO_IDS: MemberIds = {
  govtrack: null,
  icpsr: null,
  fec: [],
  lis: null,
  opensecrets: null,
  wikipedia: null,
  ballotpedia: null,
  cspan: null,
  votesmart: null,
  wikidata: null,
};

/** mart.term_history rows: one House term. */
function houseTerm(
  index: number,
  congress: number,
  start: string,
  end: string,
  state: string,
  district: number,
  party: string,
): TermHistoryItem {
  return {
    term_index: index,
    chamber: 'house',
    congress,
    end_congress: congress,
    start_date: start,
    end_date: end,
    state,
    district,
    senate_class: null,
    party,
    caucus: null,
    how: null,
    end_type: null,
  };
}

function senateTerm(
  index: number,
  congress: number,
  endCongress: number,
  start: string,
  end: string,
  state: string,
  senateClass: number,
  party: string,
  caucus: string | null = null,
): TermHistoryItem {
  return {
    term_index: index,
    chamber: 'senate',
    congress,
    end_congress: endCongress,
    start_date: start,
    end_date: end,
    state,
    district: null,
    senate_class: senateClass,
    party,
    caucus,
    how: null,
    end_type: null,
  };
}

export const STEIL: MemberDetail = {
  bioguide_id: 'S001213',
  name: { first: 'Bryan', last: 'Steil', official_full: 'Bryan Steil' },
  party: 'Republican',
  caucus: null,
  seat: {
    chamber: 'house',
    state: 'WI',
    state_name: 'Wisconsin',
    fips_state: '55',
    district: 1,
    senate_class: null,
    state_rank: null,
    label: 'WI-1',
  },
  term: {
    congress: 119,
    end_congress: 119,
    congresses: [119],
    tracked_congress: 119,
    start_date: '2025-01-03',
    end_date: '2027-01-03',
    days_remaining: 112,
    days_elapsed: 618,
  },
  bio: { birthday: '1981-03-30', age: 45, gender: 'M' },
  service: {
    first_term_start: '2019-01-03',
    serving_since: '2019-01-03',
    term_number: 4,
    chamber_since: '2019-01-03',
    chamber_term_number: 4,
    terms: [
      houseTerm(1, 116, '2019-01-03', '2021-01-03', 'WI', 1, 'Republican'),
      houseTerm(2, 117, '2021-01-03', '2023-01-03', 'WI', 1, 'Republican'),
      houseTerm(3, 118, '2023-01-03', '2025-01-03', 'WI', 1, 'Republican'),
      houseTerm(4, 119, '2025-01-03', '2027-01-03', 'WI', 1, 'Republican'),
    ],
  },
  leadership: [],
  photo_url: 'https://www.congress.gov/img/member/s001213_200.jpg',
  ids: { ...NO_IDS, govtrack: 412836, icpsr: 21970, fec: ['H8WI01156'], opensecrets: 'N00043379', wikipedia: 'Bryan Steil', ballotpedia: 'Bryan Steil', votesmart: 181289, wikidata: 'Q58494431' },
  votes: {
    roll_calls: 657,
    positions: 657,
    votes_cast: 652,
    not_voting: 5,
    attendance_pct: 99.24,
    missed_vote_pct: 0.76,
    scoring_party: 'R',
    party_unity_pct: 98.61,
    party_unity_cq_pct: 98.7,
  },
  activity: { bills_sponsored: 36, bills_cosponsored: 118, committees: 6, chairmanships: 2 },
  sources: [],
};

export const COTTON: MemberDetail = {
  bioguide_id: 'C001095',
  name: { first: 'Tom', last: 'Cotton', official_full: 'Tom Cotton' },
  party: 'Republican',
  caucus: null,
  seat: {
    chamber: 'senate',
    state: 'AR',
    state_name: 'Arkansas',
    fips_state: '05',
    district: null,
    senate_class: 2,
    state_rank: 'junior',
    label: 'Arkansas (Class 2)',
  },
  term: {
    congress: 117,
    end_congress: 119,
    congresses: [117, 118, 119],
    tracked_congress: 119,
    start_date: '2021-01-03',
    end_date: '2027-01-03',
    days_remaining: 112,
    days_elapsed: 2079,
  },
  bio: { birthday: '1977-05-13', age: 49, gender: 'M' },
  // House 2013-2015, then the Senate from 2015-01-06: continuous service since 2013
  service: {
    first_term_start: '2013-01-03',
    serving_since: '2013-01-03',
    term_number: 3,
    chamber_since: '2015-01-06',
    chamber_term_number: 2,
    terms: [
      houseTerm(1, 113, '2013-01-03', '2015-01-03', 'AR', 4, 'Republican'),
      senateTerm(2, 114, 116, '2015-01-06', '2021-01-03', 'AR', 2, 'Republican'),
      senateTerm(3, 117, 119, '2021-01-03', '2027-01-03', 'AR', 2, 'Republican'),
    ],
  },
  leadership: [
    { title: 'Senate Republican Conference Chair', chamber: 'senate', start_date: '2025-01-03', end_date: null, is_current: true },
  ],
  photo_url: null,
  ids: { ...NO_IDS, govtrack: 412508, icpsr: 21301, lis: 'S374', fec: ['H2AR04083', 'S4AR00103'], opensecrets: 'N00033363', wikipedia: 'Tom Cotton', ballotpedia: 'Tom Cotton', cspan: 63928, votesmart: 135651, wikidata: 'Q3090307' },
  votes: {
    roll_calls: 890,
    positions: 890,
    votes_cast: 876,
    not_voting: 14,
    attendance_pct: 98.43,
    missed_vote_pct: 1.57,
    scoring_party: 'R',
    party_unity_pct: 99.77,
    party_unity_cq_pct: 99.75,
  },
  activity: { bills_sponsored: 111, bills_cosponsored: 206, committees: 10, chairmanships: 1 },
  sources: [],
};

/** Independent who caucuses with the Democrats; 12th term, 4th in the Senate (mart, 2026-09-13). */
export const SANDERS: MemberDetail = {
  bioguide_id: 'S000033',
  name: { first: 'Bernard', middle: null, last: 'Sanders', nickname: 'Bernie', suffix: null, official_full: 'Bernard Sanders' },
  party: 'Independent',
  caucus: 'Democrat',
  seat: {
    chamber: 'senate',
    state: 'VT',
    state_name: 'Vermont',
    fips_state: '50',
    district: null,
    senate_class: 1,
    state_rank: 'senior',
    label: 'Vermont (Class 1)',
  },
  term: {
    congress: 119,
    end_congress: 121,
    congresses: [119, 120, 121],
    tracked_congress: 119,
    start_date: '2025-01-03',
    end_date: '2031-01-03',
    days_remaining: 1573,
    days_elapsed: 618,
  },
  bio: { birthday: '1941-09-08', age: 85, gender: 'M' },
  service: {
    first_term_start: '1991-01-03',
    serving_since: '1991-01-03',
    term_number: 12,
    chamber_since: '2007-01-04',
    chamber_term_number: 4,
    terms: [
      houseTerm(1, 102, '1991-01-03', '1993-01-03', 'VT', 0, 'Independent'),
      houseTerm(8, 109, '2005-01-04', '2007-01-03', 'VT', 0, 'Independent'),
      senateTerm(9, 110, 112, '2007-01-04', '2013-01-03', 'VT', 1, 'Independent'),
      senateTerm(12, 119, 121, '2025-01-03', '2031-01-03', 'VT', 1, 'Independent', 'Democrat'),
    ],
  },
  leadership: [
    { title: 'Senate Democratic Outreach Chair', chamber: 'senate', start_date: '2025-01-03', end_date: null, is_current: true },
    { title: 'Senate Democratic Outreach Chair', chamber: 'senate', start_date: '2023-01-03', end_date: '2025-01-03', is_current: false },
  ],
  photo_url: 'https://www.congress.gov/img/member/s000033_200.jpg',
  ids: { ...NO_IDS, govtrack: 400357, icpsr: 29147, lis: 'S313', fec: ['H8VT01016', 'S4VT00033'], opensecrets: 'N00000528', wikipedia: 'Bernie Sanders', ballotpedia: 'Bernie Sanders', cspan: 994, votesmart: 27110, wikidata: 'Q359442' },
  votes: {
    roll_calls: 890,
    positions: 887,
    votes_cast: 824,
    not_voting: 63,
    attendance_pct: 92.9,
    missed_vote_pct: 7.1,
    scoring_party: 'D',
    party_unity_pct: 95.26,
    party_unity_cq_pct: 99.87,
  },
  activity: { bills_sponsored: 40, bills_cosponsored: 200, committees: 14, chairmanships: 0 },
  sources: [],
};

/** First-term senator with three House terms behind her. */
export const SLOTKIN: MemberDetail = {
  ...SANDERS,
  bioguide_id: 'S001208',
  name: { first: 'Elissa', middle: null, last: 'Slotkin', nickname: null, suffix: null, official_full: 'Elissa Slotkin' },
  party: 'Democrat',
  caucus: null,
  seat: { ...SANDERS.seat, state: 'MI', state_name: 'Michigan', fips_state: '26', state_rank: 'junior', label: 'Michigan (Class 1)' },
  bio: { birthday: '1976-07-10', age: 50, gender: 'F' },
  service: {
    first_term_start: '2019-01-03',
    serving_since: '2019-01-03',
    term_number: 4,
    chamber_since: '2025-01-03',
    chamber_term_number: 1,
    terms: [
      houseTerm(1, 116, '2019-01-03', '2021-01-03', 'MI', 8, 'Democrat'),
      houseTerm(2, 117, '2021-01-03', '2023-01-03', 'MI', 8, 'Democrat'),
      houseTerm(3, 118, '2023-01-03', '2025-01-03', 'MI', 7, 'Democrat'),
      senateTerm(4, 119, 121, '2025-01-03', '2031-01-03', 'MI', 1, 'Democrat'),
    ],
  },
  leadership: [],
  photo_url: null,
  ids: { ...NO_IDS, lis: 'S436' },
  votes: { ...SANDERS.votes, votes_cast: 862, not_voting: 25, attendance_pct: 97.18, missed_vote_pct: 2.82, party_unity_pct: 92.57, party_unity_cq_pct: 92.24 },
  activity: { bills_sponsored: 30, bills_cosponsored: 150, committees: 11, chairmanships: 0 },
};

export const STEIL_LIST: MemberListItem = {
  bioguide_id: 'S001213',
  name: STEIL.name,
  party: 'Republican',
  caucus: null,
  seat: STEIL.seat,
  photo_url: STEIL.photo_url,
};

export const COTTON_LIST: MemberListItem = {
  bioguide_id: 'C001095',
  name: COTTON.name,
  party: 'Republican',
  caucus: null,
  seat: COTTON.seat,
  photo_url: null,
};

export const SANDERS_LIST: MemberListItem = {
  bioguide_id: 'S000033',
  name: SANDERS.name,
  party: 'Independent',
  caucus: 'Democrat',
  seat: SANDERS.seat,
  photo_url: SANDERS.photo_url,
};

export const SLOTKIN_LIST: MemberListItem = {
  bioguide_id: 'S001208',
  name: SLOTKIN.name,
  party: 'Democrat',
  caucus: null,
  seat: SLOTKIN.seat,
  photo_url: null,
};

export const STEIL_COMMITTEES: CommitteeAssignment[] = [
  { thomas_id: 'HSBA', name: 'House Committee on Financial Services', chamber: 'house', parent_thomas_id: null, parent_name: null, rank: 12, title: null },
  { thomas_id: 'HSBA16', name: 'Capital Markets', chamber: 'house', parent_thomas_id: 'HSBA', parent_name: 'House Committee on Financial Services', rank: 6, title: null },
  { thomas_id: 'HSBA21', name: 'Digital Assets, Financial Technology, and Artificial Intelligence', chamber: 'house', parent_thomas_id: 'HSBA', parent_name: 'House Committee on Financial Services', rank: 1, title: 'Chairman' },
  { thomas_id: 'HSHA', name: 'House Committee on House Administration', chamber: 'house', parent_thomas_id: null, parent_name: null, rank: 1, title: 'Chair' },
  { thomas_id: 'JSLC', name: 'Joint Committee of Congress on the Library', chamber: 'joint', parent_thomas_id: null, parent_name: null, rank: 1, title: 'Chair' },
  { thomas_id: 'JSPR', name: 'Joint Committee on Printing', chamber: 'joint', parent_thomas_id: null, parent_name: null, rank: 1, title: 'Vice Chair' },
];

export const STEIL_KEY_DATES: KeyDate[] = [
  { date: '2025-01-03', label: '119th Congress convenes', kind: 'session', scope: 'congress', scope_value: null, note: null, source_url: 'https://constitution.congress.gov/constitution/amendment-20/' },
  { date: '2026-06-01', label: 'Wisconsin nomination papers due by 5 p.m.', kind: 'deadline', scope: 'state', scope_value: 'WI', note: null, source_url: 'https://docs.legis.wisconsin.gov/statutes/statutes/8/15' },
  { date: '2026-08-11', label: 'Wisconsin partisan primary', kind: 'election', scope: 'state', scope_value: 'WI', note: null, source_url: 'https://docs.legis.wisconsin.gov/statutes/statutes/5/02' },
  { date: '2026-11-03', label: 'General election day', kind: 'election', scope: 'congress', scope_value: null, note: null, source_url: 'https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title2-section7' },
  { date: '2027-01-03', label: '119th Congress ends; House and Class 2 Senate terms expire at noon', kind: 'session', scope: 'congress', scope_value: null, note: null, source_url: 'https://constitution.congress.gov/constitution/amendment-20/' },
];

export const FEED: FeedItem[] = [
  {
    event_key: 'vote:house:2:295',
    event_type: 'vote',
    congress: 119,
    event_at: '2026-09-03T18:24:00Z',
    event_date: '2026-09-03',
    headline: 'Voted YEA on H.R. 4795: Protect Economic and Academic Freedom Act of 2026',
    detail: 'On Passage · Passed 237–169',
    detail_full: null,
    position: 'Yea',
    chamber: 'house',
    session: 2,
    roll_number: 295,
    bill_type: 'hr',
    bill_number: '4795',
    bill_label: 'H.R. 4795',
    policy_area: 'Education',
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/4795',
    source_url: 'https://clerk.house.gov/evs/2026/roll295.xml',
  },
  {
    event_key: 'vote:senate:2:1',
    event_type: 'vote',
    congress: 119,
    event_at: '2026-01-05T22:31:00Z',
    event_date: '2026-01-05',
    headline: 'Voted YEA on nomination PN12-1',
    detail: 'On the Nomination · Nomination Confirmed 52–45',
    detail_full: null,
    position: 'Yea',
    chamber: 'senate',
    session: 2,
    roll_number: 1,
    bill_type: null,
    bill_number: null,
    bill_label: null,
  policy_area: null,
    url: null,
    source_url: 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00001.xml',
  },
  {
    event_key: 'vote:house:1:353',
    event_type: 'vote',
    congress: 119,
    event_at: '2025-12-17T20:00:00Z',
    event_date: '2025-12-17',
    headline: 'Did not vote on roll call 353',
    detail: 'On Agreeing to the Amendment · Failed 201–224',
    detail_full: null,
    position: 'Not Voting',
    chamber: 'house',
    session: 1,
    roll_number: 353,
    bill_type: null,
    bill_number: null,
    bill_label: null,
  policy_area: null,
    url: null,
    source_url: 'https://clerk.house.gov/evs/2025/roll353.xml',
  },
  {
    event_key: 'vote:house:1:2',
    event_type: 'vote',
    congress: 119,
    event_at: '2025-01-03T18:00:00Z',
    event_date: '2025-01-03',
    headline: 'Voted Johnson (LA) on roll call 2',
    detail: 'Election of the Speaker · Passed 0–0',
    detail_full: null,
    position: 'Other',
    chamber: 'house',
    session: 1,
    roll_number: 2,
    bill_type: null,
    bill_number: null,
    bill_label: null,
  policy_area: null,
    url: null,
    source_url: 'https://clerk.house.gov/evs/2025/roll002.xml',
  },
  {
    event_key: 'bill_sponsor:119:hr:4735',
    event_type: 'bill_sponsored',
    congress: 119,
    event_at: '2025-07-23T04:00:00Z',
    event_date: '2025-07-23',
    headline: 'Introduced H.R. 4735: Business of Insurance Regulatory Reform Act of 2025',
    detail: 'Referred to the House Committee on Financial Services.',
    detail_full: null,
    position: null,
    chamber: null,
    session: null,
    roll_number: null,
    bill_type: 'hr',
    bill_number: '4735',
    bill_label: 'H.R. 4735',
    policy_area: 'Finance and Financial Sector',
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/4735',
    source_url: 'https://api.congress.gov/v3/member/S001213/sponsored-legislation?format=json',
  },
  {
    event_key: 'bill_cosponsor:119:hr:5269',
    event_type: 'bill_cosponsored',
    congress: 119,
    event_at: '2026-09-04T04:00:00Z',
    event_date: '2026-09-04',
    headline: 'Cosponsored H.R. 5269: RESULTS Act',
    detail: 'Referred to the Committee on Energy and Commerce.',
    detail_full: null,
    position: null,
    chamber: null,
    session: null,
    roll_number: null,
    bill_type: 'hr',
    bill_number: '5269',
    bill_label: 'H.R. 5269',
    policy_area: 'Government Operations and Politics',
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/5269',
    source_url: 'https://api.congress.gov/v3/member/S001213/cosponsored-legislation?format=json',
  },
  {
    event_key: 'action:119:hres:150:2025-02-21:abc',
    event_type: 'committee_action',
    congress: 119,
    event_at: '2025-02-21T17:00:00Z',
    event_date: '2025-02-21',
    headline: 'H.Res. 150: Submitted in House',
    detail: 'Providing for consideration of the bill',
    detail_full: null,
    position: null,
    chamber: null,
    session: null,
    roll_number: null,
    bill_type: 'hres',
    bill_number: '150',
    bill_label: 'H.Res. 150',
    policy_area: 'Congress',
    url: 'https://www.congress.gov/bill/119th-congress/house-resolution/150',
    source_url: 'https://api.congress.gov/v3/bill/119/hres/150/actions?format=json',
  },
];

export const EN_BLOC: FeedItem = {
  event_key: 'vote:senate:1:522',
  event_type: 'vote',
  congress: 119,
  event_at: '2025-10-07T21:12:00Z',
  event_date: '2025-10-07',
  headline: 'Voted YEA on 48 nominations (en bloc)',
  detail: 'On the Cloture Motion · 48 nominations · Cloture Motion Rejected 51–48',
  detail_full: 'On the Cloture Motion PN25-28 and PN12-19 and PN12-45 and PN22-1 · Cloture Motion Rejected 51–48',
  position: 'Yea',
  chamber: 'senate',
  session: 1,
  roll_number: 522,
  bill_type: null,
  bill_number: null,
  bill_label: null,
  policy_area: null,
  url: null,
  source_url: 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00522.xml',
};

export const WEEKS: WeekBucket[] = [
  { week_start: '2025-07-21', vote: 12, bill_sponsored: 1, bill_cosponsored: 3, committee_action: 0, total: 16 },
  { week_start: '2026-08-31', vote: 9, bill_sponsored: 0, bill_cosponsored: 2, committee_action: 1, total: 12 },
];

/** mart.member_fundraising row for Steil as the API returned it on 2026-09-13. */
export const STEIL_FUNDRAISING: FundraisingResponse = {
  bioguide_id: 'S001213',
  cycle: 2026,
  status: 'filed',
  candidate: {
    candidate_id: 'H8WI01156',
    name: 'STEIL, BRYAN GEORGE',
    fec_url: 'https://www.fec.gov/data/candidate/H8WI01156/?cycle=2026&election_full=false',
  },
  committee: {
    committee_id: 'C00677286',
    name: 'STEIL FOR WISCONSIN, INC.',
    fec_url: 'https://www.fec.gov/data/committee/C00677286/?cycle=2026',
  },
  coverage: { start_date: '2025-01-01', end_date: '2026-07-22', last_report_type: 'PRE-PRIMARY', last_report_year: 2026 },
  totals: { raised: 5467777.07, spent: 1359848.79, cash_on_hand: 6327098.65, debts: 0 },
  receipts: {
    individual_small: { amount: 253362.51, pct: 4.63 },
    individual_large: { amount: 1240060.26, pct: 22.68 },
    individual: { amount: 1493422.77, pct: 27.31 },
    pac: { amount: 1633675.16, pct: 29.88 },
    party: { amount: 1000, pct: 0.02 },
    self_funding: { amount: 0, pct: 0 },
    transfers: { amount: 2190887.63, pct: 40.07 },
    other: { amount: 148791.51, pct: 2.72 },
  },
  small_donor_pct: 4.63,
  small_donor_of_individual_pct: 16.97,
  sources: [],
};

/** Cotton: the Senate committee (not the old House one), with debts outstanding. */
export const COTTON_FUNDRAISING: FundraisingResponse = {
  ...STEIL_FUNDRAISING,
  bioguide_id: 'C001095',
  candidate: {
    candidate_id: 'S4AR00103',
    name: 'COTTON, THOMAS',
    fec_url: 'https://www.fec.gov/data/candidate/S4AR00103/?cycle=2026&election_full=false',
  },
  committee: {
    committee_id: 'C00499988',
    name: 'COTTON FOR SENATE, INC.',
    fec_url: 'https://www.fec.gov/data/committee/C00499988/?cycle=2026',
  },
  coverage: { start_date: '2025-01-01', end_date: '2026-06-30', last_report_type: 'JULY QUARTERLY', last_report_year: 2026 },
  totals: { raised: 6233116.56, spent: 3752101.46, cash_on_hand: 9931884.93, debts: 73959 },
  receipts: {
    individual_small: { amount: 552196.55, pct: 8.86 },
    individual_large: { amount: 2621967.92, pct: 42.07 },
    individual: { amount: 3174164.47, pct: 50.92 },
    pac: { amount: 1129500, pct: 18.12 },
    party: { amount: 62000, pct: 0.99 },
    self_funding: { amount: 0, pct: 0 },
    transfers: { amount: 1373299.48, pct: 22.03 },
    other: { amount: 494152.61, pct: 7.93 },
  },
  small_donor_pct: 8.86,
  small_donor_of_individual_pct: 17.4,
};

export const NO_FILINGS_FUNDRAISING: FundraisingResponse = {
  ...STEIL_FUNDRAISING,
  status: 'no_filings',
  coverage: null,
  totals: null,
  receipts: null,
  small_donor_pct: null,
  small_donor_of_individual_pct: null,
};

export const NO_COMMITTEE_FUNDRAISING: FundraisingResponse = {
  ...NO_FILINGS_FUNDRAISING,
  status: 'no_committee',
  committee: null,
};

export const NO_CANDIDATE_FUNDRAISING: FundraisingResponse = {
  ...NO_COMMITTEE_FUNDRAISING,
  status: 'no_candidate',
  candidate: null,
};

/** GET /bills/119/hr/5269 as the API returns it, trimmed to what the page renders. */
/* Vote journeys as GET /bills/119/{type}/{number} returned them from the live mart on
   2026-09-14 (mart.bill_journey_stage, shown stages, with mart.bill_passage_vote). */
/** H.R. 5269 (BILL): introduced, no passage roll call yet */
export const BILL_JOURNEY: JourneyStage[] = [
  {
    "stage_key": "introduced",
    "label": "Introduced",
    "order": 1,
    "status": "complete",
    "status_label": "Introduced",
    "date": "2025-09-10",
    "detail": null,
    "ends_journey": false,
    "vote": null
  },
  {
    "stage_key": "house_vote",
    "label": "House vote",
    "order": 2,
    "status": "pending",
    "status_label": "Pending",
    "date": null,
    "detail": null,
    "ends_journey": false,
    "vote": null
  },
  {
    "stage_key": "senate_vote",
    "label": "Senate vote",
    "order": 3,
    "status": "pending",
    "status_label": "Pending",
    "date": null,
    "detail": null,
    "ends_journey": false,
    "vote": null
  },
  {
    "stage_key": "to_president",
    "label": "To President",
    "order": 4,
    "status": "pending",
    "status_label": "Pending",
    "date": null,
    "detail": null,
    "ends_journey": false,
    "vote": null
  },
  {
    "stage_key": "became_law",
    "label": "Became law",
    "order": 5,
    "status": "pending",
    "status_label": "Pending",
    "date": null,
    "detail": null,
    "ends_journey": false,
    "vote": null
  }
];

/** S. 5, Laken Riley Act: Senate then House roll calls, presented, law 119-1 */
export const LAW_JOURNEY: JourneyStage[] = [
  {
    "stage_key": "introduced",
    "label": "Introduced",
    "order": 1,
    "status": "complete",
    "status_label": "Introduced",
    "date": "2025-01-06",
    "detail": null,
    "ends_journey": false,
    "vote": null
  },
  {
    "stage_key": "senate_vote",
    "label": "Senate vote",
    "order": 2,
    "status": "passed",
    "status_label": "Passed",
    "date": "2025-01-20",
    "detail": "Bill Passed",
    "ends_journey": false,
    "vote": {
      "chamber": "senate",
      "session": 1,
      "roll_number": 7,
      "vote_date": "2025-01-20",
      "question": "On Passage of the Bill S. 5",
      "result": "Bill Passed",
      "passed": true,
      "majority_label": null,
      "yea_total": 64,
      "nay_total": 35,
      "present_total": 0,
      "not_voting_total": 0,
      "yea_pct": 64.65,
      "nay_pct": 35.35,
      "parties": [
        {
          "party": "R",
          "yea": 52,
          "nay": 0,
          "yea_pct": 52.53,
          "nay_pct": 0.0
        },
        {
          "party": "D",
          "yea": 12,
          "nay": 33,
          "yea_pct": 12.12,
          "nay_pct": 33.33
        },
        {
          "party": "I",
          "yea": 0,
          "nay": 2,
          "yea_pct": 0.0,
          "nay_pct": 2.02
        }
      ],
      "source_url": "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00007.xml"
    }
  },
  {
    "stage_key": "house_vote",
    "label": "House vote",
    "order": 3,
    "status": "passed",
    "status_label": "Passed",
    "date": "2025-01-22",
    "detail": "Passed",
    "ends_journey": false,
    "vote": {
      "chamber": "house",
      "session": 1,
      "roll_number": 23,
      "vote_date": "2025-01-22",
      "question": "On Passage",
      "result": "Passed",
      "passed": true,
      "majority_label": null,
      "yea_total": 263,
      "nay_total": 156,
      "present_total": 0,
      "not_voting_total": 14,
      "yea_pct": 62.77,
      "nay_pct": 37.23,
      "parties": [
        {
          "party": "R",
          "yea": 217,
          "nay": 0,
          "yea_pct": 51.79,
          "nay_pct": 0.0
        },
        {
          "party": "D",
          "yea": 46,
          "nay": 156,
          "yea_pct": 10.98,
          "nay_pct": 37.23
        }
      ],
      "source_url": "https://clerk.house.gov/evs/2025/roll023.xml"
    }
  },
  {
    "stage_key": "to_president",
    "label": "To President",
    "order": 4,
    "status": "complete",
    "status_label": "Presented",
    "date": "2025-01-23",
    "detail": "Presented to President.",
    "ends_journey": false,
    "vote": null
  },
  {
    "stage_key": "became_law",
    "label": "Became law",
    "order": 5,
    "status": "complete",
    "status_label": "Enacted",
    "date": "2025-01-29",
    "detail": "Became Public Law No: 119-1.",
    "ends_journey": false,
    "vote": null
  }
];

/** H.R. 192: passed the House under suspension, Senate pending */
export const PASSED_HOUSE_JOURNEY: JourneyStage[] = [
  {
    "stage_key": "introduced",
    "label": "Introduced",
    "order": 1,
    "status": "complete",
    "status_label": "Introduced",
    "date": "2025-01-03",
    "detail": null,
    "ends_journey": false,
    "vote": null
  },
  {
    "stage_key": "house_vote",
    "label": "House vote",
    "order": 2,
    "status": "passed",
    "status_label": "Passed",
    "date": "2025-01-13",
    "detail": "Passed",
    "ends_journey": false,
    "vote": {
      "chamber": "house",
      "session": 1,
      "roll_number": 8,
      "vote_date": "2025-01-13",
      "question": "On Motion to Suspend the Rules and Pass",
      "result": "Passed",
      "passed": true,
      "majority_label": "2/3 required",
      "yea_total": 407,
      "nay_total": 0,
      "present_total": 0,
      "not_voting_total": 27,
      "yea_pct": 100.0,
      "nay_pct": 0.0,
      "parties": [
        {
          "party": "R",
          "yea": 206,
          "nay": 0,
          "yea_pct": 50.61,
          "nay_pct": 0.0
        },
        {
          "party": "D",
          "yea": 201,
          "nay": 0,
          "yea_pct": 49.39,
          "nay_pct": 0.0
        }
      ],
      "source_url": "https://clerk.house.gov/evs/2025/roll008.xml"
    }
  },
  {
    "stage_key": "senate_vote",
    "label": "Senate vote",
    "order": 3,
    "status": "pending",
    "status_label": "Pending",
    "date": null,
    "detail": null,
    "ends_journey": false,
    "vote": null
  },
  {
    "stage_key": "to_president",
    "label": "To President",
    "order": 4,
    "status": "pending",
    "status_label": "Pending",
    "date": null,
    "detail": null,
    "ends_journey": false,
    "vote": null
  },
  {
    "stage_key": "became_law",
    "label": "Became law",
    "order": 5,
    "status": "pending",
    "status_label": "Pending",
    "date": null,
    "detail": null,
    "ends_journey": false,
    "vote": null
  }
];

/** S. 2882: Senate passage vote failed (3/5 required); the journey ends */
export const FAILED_JOURNEY: JourneyStage[] = [
  {
    "stage_key": "introduced",
    "label": "Introduced",
    "order": 1,
    "status": "complete",
    "status_label": "Introduced",
    "date": "2025-09-18",
    "detail": null,
    "ends_journey": false,
    "vote": null
  },
  {
    "stage_key": "senate_vote",
    "label": "Senate vote",
    "order": 2,
    "status": "failed",
    "status_label": "Failed",
    "date": "2025-09-30",
    "detail": "Bill Defeated",
    "ends_journey": true,
    "vote": {
      "chamber": "senate",
      "session": 1,
      "roll_number": 534,
      "vote_date": "2025-09-30",
      "question": "On Passage of the Bill S. 2882",
      "result": "Bill Defeated",
      "passed": false,
      "majority_label": "3/5 required",
      "yea_total": 47,
      "nay_total": 53,
      "present_total": 0,
      "not_voting_total": 0,
      "yea_pct": 47.0,
      "nay_pct": 53.0,
      "parties": [
        {
          "party": "R",
          "yea": 0,
          "nay": 53,
          "yea_pct": 0.0,
          "nay_pct": 53.0
        },
        {
          "party": "D",
          "yea": 45,
          "nay": 0,
          "yea_pct": 45.0,
          "nay_pct": 0.0
        },
        {
          "party": "I",
          "yea": 2,
          "nay": 0,
          "yea_pct": 2.0,
          "nay_pct": 0.0
        }
      ],
      "source_url": "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00534.xml"
    }
  }
];

export const BILL: BillDetail = {
  congress: 119,
  bill_type: 'hr',
  bill_number: '5269',
  label: 'H.R. 5269',
  kind: 'bill',
  title: 'RESULTS Act',
  policy_area: 'Government Operations and Politics',
  introduced_date: '2025-09-10',
  latest_action_date: '2025-09-11',
  latest_action_text: 'Referred to the Committee on Energy and Commerce.',
  sponsor: {
    bioguide_id: 'B001230',
    name: 'Tammy Baldwin',
    full_name: 'Rep. Baldwin, Tammy [D-WI-2]',
    party: 'D',
    state: 'WI',
    district: 2,
    is_tracked: false,
  },
  cosponsors: { total: 3, democratic: 1, republican: 2, other: 0, withdrawn: 1 },
  action_count: 3,
  summary_count: 2,
  has_summary: true,
  roll_call_count: 1,
  congress_gov_url: 'https://www.congress.gov/bill/119th-congress/house-bill/5269',
  amended_bill_congress: null,
  amended_bill_type: null,
  amended_bill_number: null,
  update_date: '2026-09-04T00:00:00Z',
  summary: {
    version_code: '53',
    action_date: '2026-01-14',
    action_desc: 'Passed House',
    text_html:
      '<p><strong>RESULTS Act</strong></p><p>This bill requires agencies to publish outcomes.</p>',
    text_length: 96,
    update_date: '2026-01-20T10:00:00Z',
    is_latest: true,
  },
  summary_versions: [
    {
      version_code: '53',
      action_date: '2026-01-14',
      action_desc: 'Passed House',
      text_html:
        '<p><strong>RESULTS Act</strong></p><p>This bill requires agencies to publish outcomes.</p>',
      text_length: 96,
      update_date: '2026-01-20T10:00:00Z',
      is_latest: true,
    },
    {
      version_code: '00',
      action_date: '2025-09-10',
      action_desc: 'Introduced in House',
      text_html: '<p>As introduced.</p>',
      text_length: 21,
      update_date: '2025-09-17T10:00:00Z',
      is_latest: false,
    },
  ],
  cosponsor_list: [
    {
      bioguide_id: 'S001213',
      name: 'Bryan Steil',
      full_name: 'Rep. Steil, Bryan [R-WI-1]',
      party: 'R',
      state: 'WI',
      district: 1,
      date: '2026-09-04',
      is_original_cosponsor: false,
      withdrawn_date: null,
      is_withdrawn: false,
      is_tracked_member: true,
    },
    {
      bioguide_id: 'K000401',
      name: 'Kevin Kiley',
      full_name: 'Rep. Kiley, Kevin [R-CA-3]',
      party: 'R',
      state: 'CA',
      district: 3,
      date: '2026-09-05',
      is_original_cosponsor: false,
      withdrawn_date: null,
      is_withdrawn: false,
      is_tracked_member: true,
    },
    {
      bioguide_id: 'X000001',
      name: 'Dana Example',
      full_name: 'Rep. Example, Dana [D-OR-4]',
      party: 'D',
      state: 'OR',
      district: 4,
      date: '2026-09-06',
      is_original_cosponsor: false,
      withdrawn_date: '2026-09-20',
      is_withdrawn: true,
      is_tracked_member: false,
    },
  ],
  actions: [
    {
      action_date: '2025-09-11',
      action_time: null,
      action_code: 'H11100',
      action_text: 'Referred to the Committee on Energy and Commerce.',
      action_type: 'IntroReferral',
      source_system: 'House floor actions',
    },
    {
      action_date: '2025-09-10',
      action_time: '14:02:00',
      action_code: 'Intro-H',
      action_text: 'Introduced in House',
      action_type: 'IntroReferral',
      source_system: 'Library of Congress',
    },
    {
      action_date: '2025-09-10',
      action_time: null,
      action_code: null,
      action_text: 'Sponsor introductory remarks on measure.',
      action_type: 'Committee',
      source_system: 'Library of Congress',
    },
  ],
  roll_calls: [
    {
      chamber: 'house',
      session: 2,
      roll_number: 295,
      voted_at: '2026-01-14T18:24:00Z',
      vote_date: '2026-01-14',
      question: 'On Passage',
      result: 'Passed',
      yea_total: 237,
      nay_total: 169,
      present_total: 1,
      not_voting_total: 26,
      tracked_positions: [
        { bioguide_id: 'S001213', name: 'Bryan Steil', party: 'Republican', position: 'Yea' },
        { bioguide_id: 'J000294', name: 'Hakeem Jeffries', party: 'Democrat', position: 'Nay' },
      ],
      source_url: 'https://clerk.house.gov/evs/2026/roll295.xml',
    },
  ],
  journey: BILL_JOURNEY,
  sources: [],
};

/** A minor bill the Congressional Research Service has not summarised. */
export const BILL_NO_SUMMARY: BillDetail = {
  ...BILL,
  bill_number: '4735',
  label: 'H.R. 4735',
  title: 'Business of Insurance Regulatory Reform Act of 2025',
  summary: null,
  summary_versions: [],
  summary_count: 0,
  has_summary: false,
  cosponsors: { total: 0, democratic: 0, republican: 0, other: 0, withdrawn: 0 },
  cosponsor_list: [],
  roll_call_count: 0,
  roll_calls: [],
  sponsor: { ...BILL.sponsor, bioguide_id: 'S001213', name: 'Bryan Steil', is_tracked: true },
};

export const AMENDMENT: BillDetail = {
  ...BILL_NO_SUMMARY,
  bill_type: 'hamdt',
  bill_number: '9',
  label: 'H.Amdt. 9',
  kind: 'amendment',
  title: 'Amendment 9 to H.R. 21',
  journey: [], // amendments have no vote journey
  amended_bill_congress: 119,
  amended_bill_type: 'hr',
  amended_bill_number: '21',
};

/** GET /meta/sessions for the 119th, as mart.congress_session holds it. */
export const SESSIONS: CongressSession[] = [
  {
    congress: 119,
    session: 1,
    year: 2025,
    start_date: '2025-01-03',
    end_date: '2026-01-02',
    first_roll_call_date: '2025-01-03',
    last_roll_call_date: '2025-12-19',
    roll_calls: 1021,
    is_current: false,
  },
  {
    congress: 119,
    session: 2,
    year: 2026,
    start_date: '2026-01-03',
    end_date: '2027-01-03',
    first_roll_call_date: '2026-01-05',
    last_roll_call_date: '2026-09-10',
    roll_calls: 526,
    is_current: true,
  },
];

/** GET /members/{id}/contact for Steil and Boozman, as the live database returned it (2026-09-19). */
export const STEIL_CONTACT: ContactResponse = {
  bioguide_id: 'S001213',
  website_url: 'https://steil.house.gov',
  contact_form_url: null,
  phone: '202-225-3031',
  fax: null,
  office: '1526 Longworth House Office Building',
  address: '1526 Longworth House Office Building Washington DC 20515-4901',
  rss_url: null,
  sources: [
    {
      source: 'legislators',
      source_url: 'https://unitedstates.github.io/congress-legislators/legislators-current.yaml',
      fetched_at: '2026-09-16T06:12:00Z',
    },
  ],
};

export const BOOZMAN_CONTACT: ContactResponse = {
  ...STEIL_CONTACT,
  bioguide_id: 'B001236',
  website_url: 'https://www.boozman.senate.gov/public',
  contact_form_url: 'https://www.boozman.senate.gov/public/index.cfm/contact',
  phone: '202-224-4843',
  office: '555 Dirksen Senate Office Building',
  address: '555 Dirksen Senate Office Building Washington DC 20510',
};

export const NO_CONTACT: ContactResponse = {
  ...STEIL_CONTACT,
  website_url: null,
  phone: null,
  office: null,
  address: null,
  sources: [],
};

/* GET /members/{id}/constituency. The paths are small hand-drawn stand-ins for the real ones
   (which are hundreds of points long), and every ACS figure below is INVENTED for the tests:
   the shape of the response is real, the numbers are not. */
const ACS_SOURCE = {
  source: 'census_acs',
  source_url: 'https://api.census.gov/data/2024/acs/acs5/profile',
  fetched_at: '2026-09-21T06:20:00Z',
};
const BOUNDARY_SOURCES = [
  {
    source: 'census_boundary',
    source_url: 'https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_cd119_500k.zip',
    fetched_at: '2026-09-21T06:10:00Z',
  },
  {
    source: 'census_boundary',
    source_url: 'https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_county_500k.zip',
    fetched_at: '2026-09-21T06:10:00Z',
  },
];
const estimate = (value: number | null, margin: number | null = null) => ({ value, margin });
const RACE = [
  { key: 'white', pct: 78.5 },
  { key: 'black', pct: 4.9 },
  { key: 'native', pct: 0.2 },
  { key: 'asian', pct: 3.1 },
  { key: 'pacific', pct: 0.0 },
  { key: 'other', pct: 0.4 },
  { key: 'multiple', pct: 3.0 },
  { key: 'hispanic', pct: 9.9 },
] as const;

export const STEIL_CONSTITUENCY: ConstituencyResponse = {
  bioguide_id: 'S001213',
  chamber: 'house',
  label: 'WI-1',
  congress: 119,
  district: 1,
  map: {
    views: [
      {
        key: 'district',
        width: 300,
        height: 120,
        outline: 'M4,4L296,4L296,116L4,116Z',
        counties: [
          { geoid: '55059', name: 'Kenosha County', d: 'M4,4L150,4L150,116L4,116Z' },
          { geoid: '55101', name: 'Racine County', d: 'M150,4L296,4L296,116L150,116Z' },
        ],
        district: null,
      },
      {
        key: 'state',
        width: 240,
        height: 300,
        outline: 'M4,4L236,4L236,296L4,296Z',
        counties: [{ geoid: '55079', name: 'Milwaukee County', d: 'M150,200L236,200L236,296L150,296Z' }],
        district: 'M100,250L236,250L236,296L100,296Z',
      },
    ],
  },
  demographics: {
    acs_year: 2024,
    period: '2020-2024',
    name: 'Congressional District 1 (119th Congress), Wisconsin',
    population: estimate(742_318, 1_204),
    median_age: estimate(41.2, 0.3),
    median_household_income: estimate(83_450, 1_915),
    households: estimate(292_400, 2_100),
    bachelors_or_higher_pct: estimate(31.4, 1.1),
    high_school_or_higher_pct: estimate(93.6, 0.6),
    unemployment_pct: estimate(4.1, 0.5),
    poverty_pct: estimate(8.2, 0.7),
    race: RACE.map((r) => ({ ...r })),
  },
  sources: [ACS_SOURCE, ...BOUNDARY_SOURCES],
};

export const COTTON_CONSTITUENCY: ConstituencyResponse = {
  ...STEIL_CONSTITUENCY,
  bioguide_id: 'C001095',
  chamber: 'senate',
  label: 'Arkansas',
  district: null,
  map: {
    views: [
      {
        key: 'state',
        width: 280,
        height: 250,
        outline: 'M4,4L276,4L276,246L4,246Z',
        counties: [{ geoid: '05119', name: 'Pulaski County', d: 'M120,100L180,100L180,150L120,150Z' }],
        district: null,
      },
    ],
  },
};

/** Demographics loaded, boundaries not (or the reverse): the tab shows what exists. */
export const DEMOGRAPHICS_ONLY: ConstituencyResponse = {
  ...STEIL_CONSTITUENCY,
  map: null,
  sources: [ACS_SOURCE],
};
export const MAP_ONLY: ConstituencyResponse = {
  ...STEIL_CONSTITUENCY,
  demographics: null,
  sources: BOUNDARY_SOURCES,
};
export const NO_CONSTITUENCY: ConstituencyResponse = {
  ...STEIL_CONSTITUENCY,
  map: null,
  demographics: null,
  sources: [],
};

/** Real titles and dates from sanders.senate.gov/press-releases/feed/ (2026-09-19); the bodies
 *  are short stand-ins in the feed's own HTML shape (paragraphs, entities, a link, a tag). */
const SANDERS_RELEASES: StatementItem[] = [
  {
    guid: 'https://www.sanders.senate.gov/?post_type=press_releases&p=102556',
    title: 'NEWS: Sanders Statement on Federal Judge Restoring $7 Billion for Solar for All',
    published_at: '2026-09-19T15:39:36Z',
    published_date: '2026-09-19',
    url: 'https://www.sanders.senate.gov/press-releases/news-sanders-statement-on-federal-judge-restoring-7-billion-forsolar-for-all/',
    author: 'Sanders',
    categories: [],
    description: 'WASHINGTON, September 19 – Senator Bernie Sanders (I-Vt.) released the following statement.',
    content_html:
      '<p>WASHINGTON, September 19 &#8211; Senator Bernie Sanders (I-Vt.) released the following statement on the ruling.</p><p>&#8220;Working families deserve lower energy bills,&#8221; Sanders said. <a href="https://example.gov">More</a></p>',
  },
  {
    guid: 'https://www.sanders.senate.gov/?post_type=press_releases&p=102548',
    title: 'PREPARED REMARKS: Sanders: Regulating AI &#8220;is as american as apple pie.&#8221;',
    published_at: '2026-09-15T14:00:00Z',
    published_date: '2026-09-15',
    url: 'https://www.sanders.senate.gov/press-releases/prepared-remarks-sanders-regulating-ai-is-as-american-as-apple-pie/',
    author: 'Sanders',
    categories: ['Press Releases', 'Technology'],
    description: 'Remarks on artificial intelligence.',
    content_html:
      '<p>Thank you all for being here. Artificial intelligence is transforming our economy &amp; our democracy.</p><p>Let me say a word about Medicare and the health care workforce before turning to the Senate floor.</p>',
  },
  {
    guid: 'https://www.sanders.senate.gov/?post_type=press_releases&p=102101',
    title: 'NEWS: Sanders, Takano Reintroduce Bill to Move Toward 32-Hour Workweek',
    published_at: '2026-09-08T13:00:00Z',
    published_date: '2026-09-08',
    url: 'https://www.sanders.senate.gov/press-releases/news-sanders-takano-reintroduce-bill-32-hour-workweek/',
    author: 'Sanders',
    categories: ['Press Releases'],
    description: null,
    content_html: '<p>The bill would reduce the standard workweek to 32 hours without a cut in pay.</p>',
  },
];

/** `count` more releases, older than the real ones, each with a distinct title and body. */
function fillerReleases(count: number): StatementItem[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const day = String(Math.max(1, 28 - (i % 28))).padStart(2, '0');
    const month = String(8 - Math.floor(i / 28)).padStart(2, '0');
    return {
      guid: `https://www.sanders.senate.gov/?post_type=press_releases&p=${9000 - n}`,
      title: `Release number ${n} on the budget`,
      published_at: `2026-${month}-${day}T12:00:00Z`,
      published_date: `2026-${month}-${day}`,
      url: `https://www.sanders.senate.gov/press-releases/release-${n}/`,
      author: 'Sanders',
      categories: ['Press Releases'],
      description: null,
      content_html: `<p>Statement ${n}. ${n === 40 ? 'The ' + 'filler '.repeat(60) + 'unmistakable-needle appears late.' : 'Nothing further.'}</p>`,
    };
  });
}

const STATEMENT_SOURCE = {
  source: 'press_feed',
  source_url: 'https://www.sanders.senate.gov/press-releases/',
  fetched_at: '2026-09-19T23:00:00Z',
};

/** GET /members/{id}/statements for a member with a feed: 3 real releases and 42 filler ones. */
export const SANDERS_STATEMENTS: StatementsResponse = {
  bioguide_id: 'S000033',
  mode: 'feed',
  label: 'sanders.senate.gov',
  press_url: 'https://www.sanders.senate.gov/press-releases/',
  feed_url: 'https://www.sanders.senate.gov/press-releases/feed/',
  total: 45,
  newest_published_at: '2026-09-19T15:39:36Z',
  items: [...SANDERS_RELEASES, ...fillerReleases(42)],
  sources: [STATEMENT_SOURCE],
};

/** A member whose office has no feed: the tab links to the press page. */
export const STEIL_STATEMENTS: StatementsResponse = {
  bioguide_id: 'S001213',
  mode: 'link',
  label: 'steil.house.gov',
  press_url: 'https://steil.house.gov/media/press-releases',
  feed_url: null,
  total: 0,
  newest_published_at: null,
  items: [],
  sources: [
    { ...STATEMENT_SOURCE, source: 'press_page', source_url: 'https://steil.house.gov/media/press-releases' },
  ],
};

export const NO_STATEMENTS: StatementsResponse = {
  bioguide_id: 'S001213',
  mode: 'none',
  label: null,
  press_url: null,
  feed_url: null,
  total: 0,
  newest_published_at: null,
  items: [],
  sources: [],
};
