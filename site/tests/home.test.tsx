import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepresentationMap, type NationalMap } from '@/components/RepresentationMap';
import { PageShell, SiteHeader } from '@/components/SiteChrome';
import { SiteSearch } from '@/components/SiteSearch';
import { toMapSeat } from '@/lib/seats';
import type { SeatHolder } from '@/lib/types';

const base: SeatHolder = {
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
  website_url: null,
};
const SEATS = [
  base,
  { ...base, seat_key: 'house-WI-2', district: 2, bioguide_id: 'P000607', name: 'Mark Pocan', party: 'Democrat', is_tracked: false, website_url: 'https://pocan.house.gov' },
  { ...base, seat_key: 'senate-WI-1', chamber: 'senate', district: null, senate_class: 1, state_rank: 'senior', bioguide_id: 'B001230', name: 'Tammy Baldwin', party: 'Democrat' },
  { ...base, seat_key: 'senate-WI-3', chamber: 'senate', district: null, senate_class: 3, state_rank: 'junior', bioguide_id: 'J000293', name: 'Ron Johnson', party: 'Republican', is_tracked: false },
  { ...base, seat_key: 'house-DC-0', state: 'DC', state_name: 'District of Columbia', district: 0, bioguide_id: 'N000147', name: 'Eleanor Holmes Norton', party: 'Democrat', is_tracked: false },
  { ...base, seat_key: 'house-GU-0', state: 'GU', state_name: 'Guam', district: 0, bioguide_id: 'M001219', name: 'James Moylan', party: 'Republican', is_tracked: false },
].map((s) => toMapSeat(s as SeatHolder));

const MAP: NationalMap = {
  w: 100,
  h: 60,
  congress: 119,
  states: [
    { fips: '55', abbr: 'WI', name: 'Wisconsin', d: 'M0,0L10,0L10,10Z' },
    { fips: '11', abbr: 'DC', name: 'District of Columbia', d: 'M20,0L21,0L21,1Z' },
  ],
  districts: [
    { abbr: 'WI', district: 1, d: 'M0,0L5,0L5,5Z' },
    { abbr: 'WI', district: 2, d: 'M5,0L10,0L10,5Z' },
    { abbr: 'WI', district: 3, d: 'M0,5L10,5L10,10Z' },
    { abbr: 'DC', district: 0, d: 'M20,0L21,0L21,1Z' },
  ],
};

afterEach(() => vi.unstubAllGlobals());

async function renderMap(congress = 119) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => MAP })));
  const view = render(<RepresentationMap seats={SEATS} congress={congress} />);
  await act(async () => {});
  return view;
}

const fillOf = (container: HTMLElement, key: string) =>
  container.querySelector(`[data-key="${key}"]`)?.getAttribute('fill');

describe('the homepage map', () => {
  it('colors each district by the party holding it; a vacant seat and DC are gray', async () => {
    const { container } = await renderMap();
    expect(fillOf(container, 'WI-1')).toBe('#B9302F');
    expect(fillOf(container, 'WI-2')).toBe('#1F4E9C');
    expect(fillOf(container, 'WI-3')).toBe('#ECEEF3'); // nobody holds it
    expect(fillOf(container, 'DC-0')).toBe('#ECEEF3'); // a delegate has no floor vote
    expect(screen.getByText(/District lines: Census Bureau, 119th Congress\./)).toBeInTheDocument();
  });

  it('lists the territories, which the map does not draw, with their delegates', async () => {
    await renderMap();
    expect(screen.getByRole('link', { name: 'Guam: James Moylan' })).toHaveAttribute('target', '_blank');
  });

  it('stripes a state whose senators split, and DC has no Senate color', async () => {
    const { container } = await renderMap();
    fireEvent.click(screen.getByRole('button', { name: 'Senate' }));
    expect(fillOf(container, 'WI')).toBe('url(#stripe-D-R)');
    expect(fillOf(container, 'DC')).toBe('#ECEEF3');
    expect(container.querySelector('#stripe-D-R')).not.toBeNull();
    expect(screen.getByText('Split by party')).toBeInTheDocument();
  });

  it('hovering a district shows who holds it', async () => {
    const { container } = await renderMap();
    const path = container.querySelector('[data-key="WI-2"]')!;
    fireEvent.pointerMove(path, { pointerType: 'mouse', clientX: 5, clientY: 5 });
    expect(screen.getByText('House · Wisconsin')).toBeInTheDocument();
    expect(screen.getByText('Mark Pocan')).toBeInTheDocument();
    expect(screen.getByText('Click for their official website')).toBeInTheDocument();
  });

  it('a tap pins the Senate card with a link to each senator', async () => {
    const { container } = await renderMap();
    fireEvent.click(screen.getByRole('button', { name: 'Senate' }));
    const state = container.querySelector('[data-key="WI"]')!;
    fireEvent.pointerDown(state, { pointerType: 'touch', pointerId: 1 });
    fireEvent.pointerUp(state, { pointerType: 'touch', pointerId: 1 });
    const card = screen.getByRole('dialog', { name: 'Senate: Wisconsin' });
    expect(within(card).getByRole('link', { name: /Tammy Baldwin/ })).toHaveAttribute('href', '/members/B001230');
    expect(within(card).getByRole('link', { name: /Ron Johnson/ })).toHaveAttribute('target', '_blank');
    fireEvent.click(within(card).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says when the district lines are older than the Congress on the map', async () => {
    await renderMap(120);
    expect(screen.getByText(/119th Congress\. Some states have redrawn theirs since\./)).toBeInTheDocument();
  });
});

describe('the site header and footer', () => {
  it('marks the current section and offers Support and search', () => {
    render(<SiteHeader active="Articles" />);
    expect(screen.getByRole('link', { name: 'Articles' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute('href', '/support');
    expect(screen.getByRole('link', { name: 'Search members and bills' })).toHaveAttribute('href', '/search');
    fireEvent.click(screen.getByRole('button', { name: 'Congress' }));
    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('href', '/members');
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/congress');
  });

  it('the footer carries the mission and the quick links, and no GitHub link', () => {
    render(
      <PageShell active="Home">
        <p>page</p>
      </PageShell>,
    );
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText(/nonpartisan and independent/)).toBeInTheDocument();
    for (const name of ['About', 'Methodology', 'Support Term Tracker', 'Privacy policy']) {
      expect(within(footer).getByRole('link', { name })).toBeInTheDocument();
    }
    expect(within(footer).queryByRole('link', { name: /github/i })).toBeNull();
    expect(within(footer).queryByText(/Data last updated/)).toBeNull();
  });
});

describe('the search box', () => {
  it('loads the member list on first use and links each match', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [
        { name: 'Bryan Steil', detail: 'Republican · WI-1', key: 'bryan steil', haystack: 'bryan steil wisconsin wi wi-1 representative', href: '/members/S001213', external: false },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<SiteSearch />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'steil' } });
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith('/search/members.json');
    expect(screen.getByRole('link', { name: /Bryan Steil/ })).toHaveAttribute('href', '/members/S001213');
  });

  it('the Bills tab searches bills instead', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [{ label: 'H.R. 1', title: 'One Big Act', href: '/bills/119/hr/1' }],
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<SiteSearch />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bills & laws' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'hr1' } });
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith('/search/bills.json');
    expect(screen.getByRole('link', { name: /H\.R\. 1/ })).toHaveAttribute('href', '/bills/119/hr/1');
  });
});
