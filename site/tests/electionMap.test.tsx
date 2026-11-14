import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElectionMap, storageKey } from '@/components/ElectionMap';
import { buildElectionMap, type ElectionFile, type ElectionMapData } from '@/lib/elections';
import { loadElectionFile, loadElectionMap } from '@/lib/electionsContent';
import { FIXTURES, SENATORS } from './electionFixtures';

const SHAPES = {
  w: 100,
  h: 60,
  states: ['AR', 'ME', 'PA', 'TX', 'DE'].map((abbr, i) => ({ abbr, name: { AR: 'Arkansas', ME: 'Maine', PA: 'Pennsylvania', TX: 'Texas', DE: 'Delaware' }[abbr]!, d: `M${i},0L${i + 1},0L${i + 1},1Z` })),
};

const OFFICES = [
  { label: 'House', href: '/elections/house', soon: true },
  { label: 'Senate', href: '/elections/2026/senate', active: true },
  { label: 'Governor', href: '/elections/2026/governor' },
];

async function show(source: ElectionFile | ElectionMapData = loadElectionFile(2026, 'senate', FIXTURES)) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(SHAPES) })));
  const map = 'office' in source ? source : buildElectionMap(2026, 'senate', source, SENATORS);
  await act(async () => {
    render(<ElectionMap map={map} offices={OFFICES} cycles={[{ label: '2026', href: '/elections/2026/senate', active: true }]} />);
  });
}

const count = () => within(screen.getByRole('region', { name: 'Count' }));
const state = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}:`) });

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('ElectionMap', () => {
  it('opens on the Senate as it stands, with current control stated', async () => {
    await show();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2026 Senate elections');
    expect(count().getByText('47')).toBeInTheDocument();
    expect(count().getByText('53')).toBeInTheDocument();
    expect(count().getByText('Republican majority')).toBeInTheDocument();
    expect(screen.getByText(/Senate now/).parentElement).toHaveTextContent('Republican majority · 47 D · 53 R');
    expect(state('Pennsylvania')).toHaveAccessibleName('Pennsylvania: Not on the ballot in 2026');
    // the other races are links, the one not built is not
    expect(screen.getByRole('link', { name: 'Governor' })).toHaveAttribute('href', '/elections/2026/governor');
    expect(screen.queryByRole('link', { name: /House/ })).toBeNull();
    // nothing is called, so there is no final view to offer
    expect(screen.queryByRole('button', { name: 'Final result' })).toBeNull();
  });

  it('a click on a state changes its winner and the count follows', async () => {
    await show();
    expect(state('Texas')).toHaveAccessibleName('Texas: Republican');
    fireEvent.click(state('Texas')); // Republican -> other
    fireEvent.click(state('Texas')); // -> undecided
    fireEvent.click(state('Texas')); // -> Democratic
    expect(state('Texas')).toHaveAccessibleName('Texas: Democratic, flipped');
    expect(count().getByText('48')).toBeInTheDocument();
    expect(count().getByText('52')).toBeInTheDocument();
    expect(count().getByText('Change: D +1, R −1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Texas Senate');

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(count().getByText('53')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(count().getByText('No majority yet')).toBeInTheDocument();
  });

  it('the side panel picks a winner by name and links the member who has a profile', async () => {
    const file = loadElectionFile(2026, 'senate', FIXTURES);
    file.races!.find((r) => r.state === 'AR')!.candidates = [
      { name: 'Tom Cotton', party: 'Republican', member: 'C001095' },
      { name: 'A Challenger', party: 'Democratic' },
    ];
    await show(file);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Arkansas Senate');
    expect(screen.getByRole('button', { name: /Tom Cotton/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: /Tom Cotton.s profile/ })).toHaveAttribute('href', '/members/C001095');
    fireEvent.click(screen.getByRole('button', { name: /A Challenger/ }));
    expect(screen.getByRole('button', { name: /A Challenger/ })).toHaveAttribute('aria-pressed', 'true');
    expect(count().getByText('48')).toBeInTheDocument();
  });

  it('the full view shows every state after the picks, and a click there only selects', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Full Senate' }));
    expect(state('Pennsylvania')).toHaveAccessibleName('Pennsylvania: One Democratic senator, one Republican');
    expect(state('Maine')).toHaveAccessibleName('Maine: One Republican senator, one independent');
    expect(state('Maine').getAttribute('fill')).toBe('url(#stripe-IR)');
    expect(state('Arkansas')).toHaveAccessibleName('Arkansas: Both senators Republican');
    fireEvent.click(state('Arkansas'));
    expect(state('Arkansas')).toHaveAccessibleName('Arkansas: Both senators Republican');
    expect(count().getByText('53')).toBeInTheDocument();
  });

  it('once a race is called there is a final view that counts only what is called', async () => {
    const file = loadElectionFile(2026, 'senate', FIXTURES);
    Object.assign(file.races!.find((r) => r.state === 'TX')!, { winnerParty: 'Democratic', calledOn: '2026-11-04' });
    await show(file);
    fireEvent.click(screen.getByRole('button', { name: 'Final result' }));
    expect(state('Texas')).toHaveAccessibleName('Texas: Democratic, flipped');
    expect(state('Arkansas')).toHaveAccessibleName('Arkansas: Not called');
    expect(screen.getByText('1 of 35 races called.')).toBeInTheDocument();
    // 34 Democrats not on the ballot plus Texas; 31 Republicans not on the ballot
    expect(count().getByText('35')).toBeInTheDocument();
    expect(count().getByText('31')).toBeInTheDocument();
  });

  it('a visitor\'s map is kept in their browser and comes back on the next visit', async () => {
    const map = buildElectionMap(2026, 'senate', loadElectionFile(2026, 'senate', FIXTURES), SENATORS);
    const texas = map.races.find((r) => r.state === 'TX')!.id;
    window.localStorage.setItem(storageKey(map), JSON.stringify({ [texas]: 'D', gone: 'R' }));
    await show(map);
    expect(state('Texas')).toHaveAccessibleName('Texas: Democratic, flipped');
    expect(count().getByText('48')).toBeInTheDocument();

    fireEvent.click(state('Arkansas')); // Republican -> other
    expect(JSON.parse(window.localStorage.getItem(storageKey(map))!)).toEqual({
      [texas]: 'D',
      [map.races.find((r) => r.state === 'AR')!.id]: 'I',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(window.localStorage.getItem(storageKey(map))).toBeNull();
  });

  it('President: electoral votes to 270, Maine and Nebraska by district, and no full view', async () => {
    await show(loadElectionMap({ cycle: 2028, office: 'president' }, SENATORS, FIXTURES));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2028 presidential election');
    expect(count().getByText('226')).toBeInTheDocument();
    expect(count().getByText('312')).toBeInTheDocument();
    expect(count().getByText('270 electoral votes to win')).toBeInTheDocument();
    expect(screen.getByText('2024 result').parentElement).toHaveTextContent('Republican win · 226 D · 312 R');
    expect(screen.queryByRole('button', { name: /Full|All Governors/ })).toBeNull();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Arkansas');
    expect(screen.getByText('6 electoral votes · Republican in 2024')).toBeInTheDocument();

    const district = screen.getByRole('button', { name: /^Maine 2nd District:/ });
    expect(district).toHaveAccessibleName('Maine 2nd District: Republican');
    fireEvent.click(district); // Republican -> other
    fireEvent.click(district); // -> undecided
    fireEvent.click(district); // -> Democratic
    expect(count().getByText('227')).toBeInTheDocument();
    expect(count().getByText('311')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Maine 2nd District');
    expect(screen.getByText('1 electoral vote · Republican in 2024')).toBeInTheDocument();
    // the statewide votes are their own button, and the shape follows them
    expect(screen.getByRole('button', { name: /^Maine, statewide:/ })).toHaveAccessibleName('Maine, statewide: Democratic');
    expect(state('Maine')).toHaveAccessibleName('Maine: Democratic');
  });

  it('an archived map opens on the final result and still plays', async () => {
    const file = loadElectionFile(2026, 'senate', FIXTURES);
    file.archived = true;
    Object.assign(file.races!.find((r) => r.state === 'TX')!, { winnerParty: 'Republican' });
    await show(file);
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Final result' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Play it out' }));
    fireEvent.click(state('Texas'));
    expect(state('Texas')).toHaveAccessibleName('Texas: Independent, flipped');
  });

  it('a seat that changes party is hatched and counted as flipped, on the play and final views', async () => {
    const file = loadElectionFile(2026, 'senate', FIXTURES);
    Object.assign(file.races!.find((r) => r.state === 'TX')!, { winnerParty: 'Democratic' });
    Object.assign(file.races!.find((r) => r.state === 'AR')!, { winnerParty: 'Republican' });
    await show(file);
    expect(count().getByText(/Flipped:/)).toHaveTextContent('Flipped: 0');
    expect(state('Maine').getAttribute('fill')).toBe('#B9302F');

    fireEvent.click(state('Maine')); // Republican -> other: a flip
    expect(state('Maine')).toHaveAccessibleName('Maine: Independent, flipped');
    expect(state('Maine').getAttribute('fill')).toBe('url(#flip-I)');
    fireEvent.click(state('Maine')); // -> undecided: not a flip
    expect(state('Maine')).toHaveAccessibleName('Maine: Undecided');
    fireEvent.click(state('Maine')); // -> Democratic
    expect(state('Maine').getAttribute('fill')).toBe('url(#flip-D)');
    expect(count().getByText(/Flipped:/)).toHaveTextContent('Flipped: 1');

    // the full view shows whole delegations, so it marks splits and not flips
    fireEvent.click(screen.getByRole('button', { name: 'Full Senate' }));
    expect(state('Maine')).toHaveAccessibleName('Maine: One Democratic senator, one independent');
    expect(count().queryByText(/Flipped:/)).toBeNull();

    // the final view marks the owner's calls: Texas flipped, Arkansas held
    fireEvent.click(screen.getByRole('button', { name: 'Final result' }));
    expect(state('Texas')).toHaveAccessibleName('Texas: Democratic, flipped');
    expect(state('Texas').getAttribute('fill')).toBe('url(#flip-D)');
    expect(state('Arkansas')).toHaveAccessibleName('Arkansas: Republican');
    expect(state('Arkansas').getAttribute('fill')).toBe('#B9302F');
    expect(count().getByText(/Flipped:/)).toHaveTextContent('Flipped: 1');
  });
});
