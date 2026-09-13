/* Shape reference only. Replace with API/static-build data.
   Counts below are the real tracked values as of Sep 12, 2026. */

export const STEIL = {
  bioguideId: 'S001213',
  name: 'Rep. Bryan Steil',
  lastName: 'Steil',
  party: 'Republican',
  chamber: 'House',
  chamberLabel: 'U.S. House of Representatives',
  state: 'Wisconsin',
  seat: 'Wisconsin’s 1st District',
  seatShort: 'WI-1',
  congress: '119th Congress',
  termLine: 'Term: Jan 3, 2025 – Jan 3, 2027 · 657 roll calls to date',
  term: { start: 'Jan 3, 2025', end: 'Jan 3, 2027', elapsed: 618, total: 730 },
  stats: [
    { label: 'Attendance',       value: '99.24%', note: '652 of 657 roll calls' },
    { label: 'Party unity',      value: '98.7%',  note: 'votes with party majority' },
    { label: 'Bills sponsored',  value: '36',     note: '119th Congress' },
    { label: 'Bills cosponsored',value: '118',    note: '119th Congress' },
    { label: 'Committees',       value: '6',      note: '1 chairmanship' }
  ],
  eventTotals: { vote: 657, sponsor: 36, cosponsor: 118, committee: 65 }, // 876
  committees: [
    { name: 'Committee on House Administration', role: 'Chair' },
    { name: 'Joint Committee on Printing', role: 'Chair' },
    { name: 'Joint Committee on the Library', role: 'Member' },
    { name: 'Committee on Financial Services', role: 'Member' },
    { name: 'Subcommittee on Capital Markets', role: 'Member' },
    { name: 'Subcommittee on Digital Assets, Financial Technology and Artificial Intelligence', role: 'Member' }
  ],
  election: { date: 'Nov 3, 2026', daysAway: 52, kind: 'General Election', opponent: null, rating: null },
  keyDates: [
    { date: 'Sep 24, 2026', label: 'Absentee ballots begin going out to voters' },
    { date: 'Oct 20 – Nov 1, 2026', label: 'In-person early voting period, Wisconsin' },
    { date: 'Nov 3, 2026', label: 'General Election · WI-01' }
  ]
};

export const COTTON = {
  bioguideId: 'C001095',
  name: 'Sen. Tom Cotton',
  lastName: 'Cotton',
  party: 'Republican',
  chamber: 'Senate',
  chamberLabel: 'U.S. Senate',
  state: 'Arkansas',
  seat: 'Arkansas · Class 2',
  seatShort: 'Arkansas (Class 2)',
  congress: 'Tracking 119th Congress',
  termLine: 'Term: Jan 3, 2021 – Jan 3, 2027 · 890 roll calls in the 119th',
  term: { start: 'Jan 3, 2021', end: 'Jan 3, 2027', elapsed: 2079, total: 2191 },
  stats: [
    { label: 'Attendance',        value: '98.43%', note: '876 of 890 roll calls' },
    { label: 'Party unity',       value: '99.75%', note: 'votes with party majority' },
    { label: 'Bills sponsored',   value: '111',    note: '119th Congress' },
    { label: 'Bills cosponsored', value: '206',    note: '119th Congress' },
    { label: 'Committees',        value: '10',     note: '2 chairmanships' }
  ],
  eventTotals: { vote: 890, sponsor: 111, cosponsor: 206, committee: 95 }, // 1,302
  committees: [
    { name: 'Select Committee on Intelligence', role: 'Chair' },
    { name: 'Subcommittee on Airland', role: 'Chair' },
    { name: 'Committee on Armed Services', role: 'Member' },
    { name: 'Committee on the Judiciary', role: 'Member' },
    { name: 'Joint Economic Committee', role: 'Member' },
    { name: 'Subcommittee on Strategic Forces', role: 'Member' },
    { name: 'Subcommittee on Personnel', role: 'Member' },
    { name: 'Subcommittee on Criminal Justice and Counterterrorism', role: 'Member' },
    { name: 'Subcommittee on Immigration, Citizenship and Border Safety', role: 'Member' },
    { name: 'Subcommittee on Federal Courts, Oversight and Agency Action', role: 'Member' }
  ],
  election: { date: 'Nov 3, 2026', daysAway: 52, kind: 'General Election', opponent: null, rating: null },
  keyDates: [
    { date: 'Mar 3, 2026', label: 'Arkansas preferential primary · completed' },
    { date: 'Oct 5, 2026', label: 'Voter registration deadline, Arkansas' },
    { date: 'Oct 19 – Nov 2, 2026', label: 'Early voting period, Arkansas' },
    { date: 'Nov 3, 2026', label: 'General Election · Arkansas' }
  ]
};

/* Feed rows. type ∈ eventTypes; `lead` is the bold dark vote position, if any.
   Nomination votes legitimately have no bill title — the roll-call detail
   carries the meaning on the secondary line. */
export const STEIL_FEED = [
  { date: 'Thursday, Sep 10, 2026', items: [
    { type: 'vote', lead: 'Voted YEA ', headline: 'on H.R. 4795: Protect Economic and Academic Freedom Act of 2026', secondary: 'On Passage · Passed 237–169', source: 'https://www.congress.gov' },
    { type: 'cosponsor', headline: 'Cosponsored H.R. 5120: Great Lakes Restoration Financing Act', secondary: 'Referred to the Committee on Transportation and Infrastructure', source: 'https://www.congress.gov' }
  ]},
  { date: 'Wednesday, Sep 9, 2026', items: [
    { type: 'vote', lead: 'Voted NAY ', headline: 'on H.Amdt. 612 to H.R. 4712', secondary: 'On Agreeing to the Amendment · Failed 201–224', source: 'https://www.congress.gov' },
    { type: 'committee', headline: 'Committee on House Administration: markup of H.R. 5001', secondary: 'Ordered to be reported, as amended · 8–4', source: 'https://www.congress.gov' }
  ]}
];

export const MEMBER_INDEX = [
  { bioguideId: 'S001213', name: 'Rep. Bryan Steil', lastName: 'Steil', party: 'Republican',
    chamber: 'House', state: 'Wisconsin', seatShort: 'WI-1', attendance: 99.24, sponsored: 36, unity: 98.7 },
  { bioguideId: 'C001095', name: 'Sen. Tom Cotton', lastName: 'Cotton', party: 'Republican',
    chamber: 'Senate', state: 'Arkansas', seatShort: 'Arkansas (Class 2)', attendance: 98.43, sponsored: 111, unity: 99.75 }
];
