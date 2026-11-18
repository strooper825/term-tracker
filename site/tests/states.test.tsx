import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StateChamberBar } from '@/components/StateChamberBar';
import { StateLegislatureMap, districtFill, districtLabel } from '@/components/StateLegislatureMap';
import { StatePage } from '@/components/StatePage';
import {
  buildChamberBar,
  chamberHeadline,
  controlLabel,
  indexDistricts,
  seatLetters,
  toMapData,
  type StateChamber,
  type StateDetailResponse,
  type StateSummary,
} from '@/lib/states';

// Invented figures in the shape of GET /api/v1/states/{abbr} (ADR 0035).
function chamber(over: Partial<StateChamber>): StateChamber {
  return {
    chamber: 'lower',
    name: 'House',
    title: 'Representative',
    seats: 100,
    republican: 0,
    democratic: 0,
    other: 0,
    nonpartisan: 0,
    vacant: 0,
    majority_seats: 51,
    supermajority_seats: 67,
    supermajority_fraction: '2/3',
    supermajority_basis: 'two-thirds of members to override',
    control_party: null,
    control_group: null,
    control_kind: 'none',
    control_note: null,
    parties: [],
    ...over,
  };
}

const SENATE = chamber({
  chamber: 'upper',
  name: 'Senate',
  title: 'Senator',
  seats: 30,
  republican: 21,
  democratic: 8,
  vacant: 1,
  majority_seats: 16,
  supermajority_seats: 20,
  control_party: 'R',
  control_group: 'R',
  control_kind: 'supermajority',
  parties: [
    { party: 'D', party_group: 'D', seats: 8 },
    { party: 'R', party_group: 'R', seats: 21 },
  ],
});

const HOUSE = chamber({
  republican: 48,
  democratic: 50,
  other: 2,
  parties: [
    { party: 'D', party_group: 'D', seats: 50 },
    { party: 'I', party_group: 'Independent', seats: 2 },
    { party: 'R', party_group: 'R', seats: 48 },
  ],
});

const SUMMARY: StateSummary = {
  state: 'XX',
  name: 'Example',
  control: 'split',
  governor: {
    person_id: 'ocd-person/1',
    name: 'Pat Example',
    title: 'Governor',
    party: 'R',
    party_label: 'Republican',
    image_url: null,
    website_url: 'https://governor.example',
    start_date: '2023-01-02',
  },
  chambers: [SENATE, HOUSE],
};

const DETAIL: StateDetailResponse = {
  as_of: '2026-11-02',
  state: SUMMARY,
  legislature_name: 'Example General Assembly',
  districts: [
    { chamber: 'upper', district: '1', seats: 1, shape: '001', note: null },
    { chamber: 'upper', district: '2', seats: 1, shape: '002', note: null },
    { chamber: 'lower', district: '1A', seats: 1, shape: '001', note: null },
    { chamber: 'lower', district: '1B', seats: 1, shape: '001', note: null },
    { chamber: 'lower', district: 'Example 9', seats: 2, shape: null, note: 'floterial' },
  ],
  legislators: [
    { person_id: 'a', chamber: 'upper', district: '1', shape: '001', district_seats: 1, district_note: null, name: 'Ann Senator', party: 'R', party_label: 'Republican', image_url: null, email: null, website_url: 'https://leg.example/ann' },
    { person_id: 'b', chamber: 'lower', district: '1A', shape: '001', district_seats: 1, district_note: null, name: 'Bo Rep', party: 'D', party_label: 'Democratic-Farmer-Labor', image_url: null, email: null, website_url: null },
    { person_id: 'c', chamber: 'lower', district: '1B', shape: '001', district_seats: 1, district_note: null, name: 'Cy Rep', party: 'R', party_label: 'Republican', image_url: null, email: null, website_url: null },
    { person_id: 'd', chamber: 'lower', district: 'Example 9', shape: null, district_seats: 2, district_note: 'floterial', name: 'Di Floater', party: 'I', party_label: 'Independent', image_url: null, email: null, website_url: null },
  ],
  generated_at: '2026-11-17T00:00:00Z',
  sources: [{ source: 'openstates_people', source_url: 'https://example/tar.gz/x', fetched_at: '2026-11-17T06:00:00Z' }],
};

describe('states model', () => {
  it('names who controls a state and each chamber', () => {
    expect(controlLabel({ ...SUMMARY, control: 'R' })).toBe('Republican control');
    expect(controlLabel(SUMMARY)).toBe('Divided government');
    expect(controlLabel({ ...SUMMARY, control: 'N' })).toBe('Nonpartisan legislature');
    const pr = { ...SUMMARY, control: 'I' as const, chambers: [chamber({ control_party: 'I', control_group: 'Partido Nuevo Progresista', control_kind: 'majority' })] };
    expect(controlLabel(pr)).toBe('Partido Nuevo Progresista control');
    expect(chamberHeadline(SENATE)).toBe('Republican supermajority');
    expect(chamberHeadline(HOUSE)).toBe('No party has a majority');
    expect(chamberHeadline(chamber({ control_kind: 'coalition' }))).toBe('Run by a bipartisan coalition');
  });

  it('builds the bar with vacant seats before the Republicans and both thresholds', () => {
    const bar = buildChamberBar(SENATE);
    expect(bar.segments.map((s) => [s.party, s.seats])).toEqual([
      ['D', 8],
      ['V', 1],
      ['R', 21],
    ]);
    // Republicans are drawn on the right, so their lines count in from the right edge
    expect(bar.fromRight).toBe(true);
    expect(bar.majorityPct).toBeCloseTo(46.67, 1);
    expect(bar.supermajorityPct).toBeCloseTo(33.33, 1);
    expect(bar.detail).toBe('16 seats for a majority · 20 for a supermajority (2/3)');
    expect(bar.segments.map((s) => s.legend)).toEqual(['Democratic 8', 'Vacant 1', 'Republican 21']);
  });

  it('counts a Democratic or other leader in from the left, moving its block to the front', () => {
    const dem = buildChamberBar(
      chamber({
        seats: 40,
        majority_seats: 21,
        supermajority_seats: 27,
        control_party: 'D',
        control_group: 'D',
        control_kind: 'supermajority',
        parties: [
          { party: 'D', party_group: 'D', seats: 29 },
          { party: 'R', party_group: 'R', seats: 10 },
        ],
        vacant: 1,
      }),
    );
    expect(dem.fromRight).toBe(false);
    expect(dem.majorityPct).toBeCloseTo(52.5, 1);
    expect(dem.supermajorityPct).toBeCloseTo(67.5, 1);

    const third = buildChamberBar(
      chamber({
        seats: 28,
        majority_seats: 15,
        supermajority_seats: 19,
        control_party: 'I',
        control_group: 'Partido Nuevo Progresista',
        control_kind: 'majority',
        parties: [
          { party: 'D', party_group: 'D', seats: 4 },
          { party: 'I', party_group: 'Partido Nuevo Progresista', seats: 18 },
          { party: 'R', party_group: 'R', seats: 6 },
        ],
      }),
    );
    expect(third.segments.map((s) => s.key)).toEqual(['I-Partido Nuevo Progresista', 'D-D', 'R-R']);
    expect(third.fromRight).toBe(false);

    // no majority: the lines go with the biggest group, here the Republicans
    const none = buildChamberBar(HOUSE);
    expect(none.fromRight).toBe(false);
    const rLed = buildChamberBar({ ...HOUSE, parties: [{ party: 'D', party_group: 'D', seats: 40 }, { party: 'R', party_group: 'R', seats: 50 }] });
    expect(rLed.fromRight).toBe(true);
  });

  it('groups Idaho-style seats onto one shape and keeps shapeless seats apart', () => {
    const { byShape, shapeless } = indexDistricts(toMapData(DETAIL));
    const house1 = byShape.get('lower|001')!;
    expect(house1.districts).toEqual(['1A', '1B']);
    expect(house1.seats).toBe(2);
    expect(seatLetters(house1)).toEqual(['D', 'R']);
    expect(byShape.get('upper|002')!.members).toEqual([]);
    expect(shapeless).toEqual([
      expect.objectContaining({ district: 'Example 9', seats: 2, note: 'floterial', members: [expect.objectContaining({ name: 'Di Floater' })] }),
    ]);
  });

  it('colours a district by its members, striping a split and ignoring a lone vacancy', () => {
    expect(districtFill(['R'])).toBe('#B9302F');
    expect(districtFill(['V'])).toBe('#ECEEF3');
    expect(districtFill(['R', 'R', 'V'])).toBe('#B9302F');
    expect(districtFill(['R', 'D'])).toBe('url(#st-stripe-D-R)');
    expect(districtLabel(['10A', '10B'])).toBe('District 10');
    expect(districtLabel(['7'])).toBe('District 7');
    expect(districtLabel(['Hillsborough 12'])).toBe('Hillsborough 12');
  });
});

describe('state page', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the governor, control and a bar per chamber', () => {
    render(<StatePage summary={SUMMARY} legislatureName="Example General Assembly" asOf="2026-11-02" sourceDate="2026-11-17" lastUpdated={null} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Example');
    expect(screen.getByText('Divided government')).toBeInTheDocument();
    const governor = screen.getByRole('region', { name: 'Governor' });
    expect(governor).toHaveTextContent('Pat Example');
    expect(governor).toHaveTextContent('Republican');
    expect(screen.getByText('As of Nov 2, 2026')).toBeInTheDocument();
    expect(screen.getByText('Republican supermajority')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Senate: Democratic 8, Vacant 1, Republican 21 of 30 seats/ })).toBeInTheDocument();
  });

  it('labels the supermajority line only when it is clear of the majority line', () => {
    const { container } = render(<StateChamberBar chamber={SENATE} />);
    expect(container.querySelector('[data-marker="upper-supermajority"]')).toHaveTextContent('');
    const wide = chamber({ seats: 100, majority_seats: 51, supermajority_seats: 67 });
    const { container: c2 } = render(<StateChamberBar chamber={wide} />);
    expect(c2.querySelector('[data-marker="lower-supermajority"]')).toHaveTextContent('Supermajority 67');
  });

  it('loads the map and opens a district card on a tap', async () => {
    const drawing = {
      abbr: 'XX',
      name: 'Example',
      w: 100,
      h: 60,
      vintage: 2025,
      outline: 'M0,0L100,0L100,60Z',
      chambers: { upper: [['001', 'M0,0L10,0L10,10Z'], ['002', 'M20,0L30,0L30,10Z']], lower: [['001', 'M0,0L50,0L50,60Z']] },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(url.startsWith('/maps/') ? drawing : toMapData(DETAIL)) }),
      ),
    );
    await act(async () => {
      render(
        <StateLegislatureMap
          abbr="XX"
          chambers={[
            { chamber: 'upper', name: 'Senate', title: 'Senator' },
            { chamber: 'lower', name: 'House', title: 'Representative' },
          ]}
        />,
      );
    });
    // opens on the lower chamber; the floterial seat is listed below the map
    expect(screen.getByRole('button', { name: 'House' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Floterial districts/)).toBeInTheDocument();
    expect(screen.getByText('Di Floater')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Senate' }));
    const shape = document.querySelector('path[data-key="002"]')!;
    expect(shape.getAttribute('fill')).toBe('#ECEEF3');
    const one = document.querySelector('path[data-key="001"]')!;
    fireEvent.pointerDown(one, { pointerId: 1, pointerType: 'touch', clientX: 5, clientY: 5 });
    fireEvent.pointerUp(one, { pointerId: 1, pointerType: 'touch', clientX: 5, clientY: 5 });
    const card = screen.getByRole('dialog', { name: 'Senate: District 1' });
    expect(within(card).getByRole('link', { name: /Ann Senator/ })).toHaveAttribute('href', 'https://leg.example/ann');
    expect(card).toHaveTextContent('Republican');
  });
});
