import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CongressOverview } from '@/components/CongressOverview';
import { buildCongressModel } from '@/lib/congress';
import { OVERVIEW, manyPassed } from './congressFixtures';

function page(data = OVERVIEW) {
  return render(
    <CongressOverview model={buildCongressModel(data)} lastUpdated="Sep 19, 2026 06:12 UTC" />,
  );
}

describe('congress overview: given these mart rows, this text renders', () => {
  it('header: title, dates, and the seated line read from the seed', () => {
    page();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The 119th Congress');
    expect(screen.getByText('Jan 3, 2025 — Jan 3, 2027')).toBeInTheDocument();
    expect(screen.getByText('Seated 533 of 535 · 2 vacancies')).toBeInTheDocument();
  });

  it('composition header cites the sources, the as-of date, and that it is manual', () => {
    page();
    const card = screen.getByRole('region', { name: 'Chamber composition' });
    expect(within(card).getByText('All 535 seats')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /Clerk of the House/ })).toHaveAttribute(
      'href',
      'https://clerk.house.gov/Members',
    );
    expect(within(card).getByRole('link', { name: /Senate\.gov/ })).toHaveAttribute(
      'href',
      'https://www.senate.gov/senators/',
    );
    expect(card).toHaveTextContent('as of Sep 19, 2026 · updated manually');
  });

  it('says in words which party controls each chamber, and by how many seats', () => {
    page();
    expect(screen.getByText('Republicans control the House')).toBeInTheDocument();
    expect(screen.getByText('Republicans control the Senate')).toBeInTheDocument();
    // House: 218 R + 1 independent who caucuses with them, against 214 Democrats
    expect(
      screen.getByText(
        '219 seats caucus with Republicans (218 Republicans + 1 independent) · 214 with Democrats',
      ),
    ).toBeInTheDocument();
    // Senate: 53 R against 45 D + 2 independents who caucus with them
    expect(
      screen.getByText(
        '53 seats caucus with Republicans · 47 with Democrats (45 Democrats + 2 independents)',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/R \+\d/)).not.toBeInTheDocument(); // the bare margin is gone
  });

  it('reads neutrally when neither party has a majority', () => {
    const tied = structuredClone(OVERVIEW);
    tied.composition.chambers[0].majority_party = null;
    tied.composition.chambers[0].majority_letter = null;
    page(tied);
    expect(screen.getByText('Neither party has a majority in the House')).toBeInTheDocument();
  });

  it('marks the majority line on each bar at the mart position', () => {
    page();
    const house = document.querySelector('[data-majority-marker="house"]') as HTMLElement;
    const senate = document.querySelector('[data-majority-marker="senate"]') as HTMLElement;
    expect(house.style.left).toBe('50.11%');
    expect(senate.style.left).toBe('51%');
    expect(house).toHaveTextContent('218 seats for a majority');
    expect(senate).toHaveTextContent('51 seats for a majority');
    expect(screen.getByText('435 seats')).toBeInTheDocument();
  });

  it('the composition bar is proportional: segment width is the mart seat_pct', () => {
    page();
    const house = screen.getByRole('img', { name: /^House composition/ });
    const width = (key: string) =>
      (house.querySelector(`[data-segment="${key}"]`) as HTMLElement).style.width;
    expect(width('republican')).toBe('50.11%');
    expect(width('democratic')).toBe('49.2%');
    expect(width('independent')).toBe('0.23%');
    expect(width('vacant')).toBe('0.46%');
    expect(house.querySelector('[data-segment="vacant"]')).toHaveTextContent('');
    expect(house.querySelector('[data-segment="republican"]')).toHaveTextContent('218 R');
    const senate = screen.getByRole('img', { name: /^Senate composition/ });
    expect(senate.querySelector('[data-segment="democratic"]')).toHaveTextContent('45 D');
  });

  it('empty bar segments carry no padding, so a one-seat sliver cannot widen past its share', () => {
    page();
    const house = screen.getByRole('img', { name: /^House composition/ });
    for (const key of ['independent', 'vacant']) {
      const seg = house.querySelector(`[data-segment="${key}"]`) as HTMLElement;
      expect(seg.childElementCount).toBe(0);
      expect(seg.className).not.toMatch(/px-/);
    }
    // the padding is on the label of a segment that has one
    const label = house.querySelector('[data-segment="republican"] > span') as HTMLElement;
    expect(label.className).toContain('px-3');
  });

  it('legends count every group, name the caucus, and show vacancies only where there are some', () => {
    page();
    expect(screen.getByText('Republican 218')).toBeInTheDocument();
    expect(screen.getByText('Vacant 2')).toBeInTheDocument();
    expect(screen.getByText('Independent 1 · caucus with R')).toBeInTheDocument();
    expect(screen.getByText('Independent 2 · caucus with D')).toBeInTheDocument();
    expect(screen.getAllByText(/^Vacant/)).toHaveLength(1);
  });

  it('passed-both is a whole-database table and points back at the counts above it', () => {
    page();
    const card = screen.getByRole('region', { name: 'Passed both chambers' });
    expect(within(card).getByText('All sponsors')).toBeInTheDocument();
    expect(
      within(card).getByText('7 measures · 4 enacted · 3 adopted · 0 vetoed'),
    ).toBeInTheDocument();
    expect(card).toHaveTextContent('The same bills as the counts above.');
  });

  it('H.R. 1 is in the table with its law number and both tallies', () => {
    page();
    const row = screen.getByRole('link', { name: /H\.R\. 1 / }).closest('div') as HTMLElement;
    expect(within(row).getByText('215–214')).toBeInTheDocument();
    expect(within(row).getByText('50–50')).toBeInTheDocument();
    expect(within(row).getByText('Law 119-21')).toBeInTheDocument();
  });

  it('has no scope-change divider: nothing on the page counts only the tracked members', () => {
    page();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    expect(screen.queryByText(/Scope change/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Everything below counts only/i)).not.toBeInTheDocument();
  });

  it('sections run composition, then activity, then the passed-both table', () => {
    page();
    const composition = screen.getByRole('region', { name: 'Chamber composition' });
    const activity = screen.getByRole('region', { name: 'Legislative activity' });
    const passed = screen.getByRole('region', { name: 'Passed both chambers' });
    const after = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(composition.compareDocumentPosition(activity) & after).toBeTruthy();
    expect(activity.compareDocumentPosition(passed) & after).toBeTruthy();
  });

  it('activity card says what its counts cover and links to the tracked members', () => {
    page();
    const card = screen.getByRole('region', { name: 'Legislative activity' });
    expect(within(card).getByText('All sponsors')).toBeInTheDocument();
    expect(card).toHaveTextContent('119th Congress to date');
    expect(card).toHaveTextContent('Every bill in our database (3,922), whoever sponsored it');
    expect(card).toHaveTextContent('bills our 20 tracked members sponsored or cosponsored');
    expect(card).toHaveTextContent('Not yet every bill in Congress');
    expect(within(card).getByRole('link', { name: /See tracked members/ })).toHaveAttribute(
      'href',
      '/members',
    );
  });

  it('shows four stats over every bill in the database, and none of the removed ones', () => {
    page();
    const stat = (label: string) => screen.getByText(label).parentElement as HTMLElement;
    expect(stat('Bills in our database')).toHaveTextContent('3,922');
    expect(stat('Bills in our database')).toHaveTextContent('1,956 House · 1,966 Senate');
    expect(stat('Passed a chamber')).toHaveTextContent('665');
    expect(stat('Passed a chamber')).toHaveTextContent('425 House bills · 240 Senate bills');
    expect(stat('Became law')).toHaveTextContent('69');
    expect(stat('Became law')).toHaveTextContent('1.8% of bills in our database');
    expect(stat('Vetoed')).toHaveTextContent('2');
    expect(stat('Vetoed')).toHaveTextContent('0 overridden · 2 not overridden');
    // it is not claimed to be every bill introduced in Congress
    expect(screen.queryByText('Bills introduced')).not.toBeInTheDocument();
    for (const gone of [
      /Roll call votes/i,
      /Committee actions/i,
      /^Resolutions$/i,
      /Still in committee/i,
      /Introduced by measure type/i,
    ]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
  });

  it('passed-both table: outcome, public law, Congress.gov links, and honest vote cells', () => {
    page();
    const row = screen.getByRole('link', { name: /H\.R\. 4405/ }).closest('div') as HTMLElement;
    expect(within(row).getByText('427–1')).toBeInTheDocument();
    expect(within(row).getByText('Law 119-38')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /H\.R\. 4405/ })).toHaveAttribute(
      'href',
      'https://www.congress.gov/bill/119th-congress/house-bill/4405',
    );
    expect(
      within(row).getByRole('link', { name: 'Epstein Files Transparency Act' }),
    ).toHaveAttribute('href', '/bills/119/hr/4405');
    expect(within(row).getByText('No roll call recorded')).toBeInTheDocument();
    expect(screen.queryByText(/voice vote/i)).not.toBeInTheDocument();
  });

  it('every link to another site opens in a new tab; links within the site do not', () => {
    page();
    const links = screen.getAllByRole('link') as HTMLAnchorElement[];
    const external = links.filter((a) => /^https?:\/\//.test(a.getAttribute('href') ?? ''));
    expect(external.length).toBeGreaterThan(8); // sources, About, Data, dictionary, Congress.gov rows
    for (const a of external) {
      expect(a, a.getAttribute('href') ?? '').toHaveAttribute('target', '_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }
    for (const a of links.filter((l) => l.getAttribute('href')?.startsWith('/'))) {
      expect(a).not.toHaveAttribute('target');
    }
  });

  it('shows no "Show all" control while everything already fits', () => {
    page();
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 7 of 7/)).toBeInTheDocument();
  });

  it('cuts at eight rows and expands in place, with veto and override outcomes', () => {
    page(manyPassed());
    expect(screen.getByText(/Showing 8 of 11/)).toBeInTheDocument();
    expect(screen.queryByText('Extra measure 3')).not.toBeInTheDocument();
    const chips = () =>
      Array.from(document.querySelectorAll('span.rounded-chip.whitespace-nowrap')).map(
        (el) => el.textContent,
      );
    expect(chips()).toContain('Overridden');
    expect(chips()).toContain('Adopted');
    expect(chips()).not.toContain('Vetoed'); // the ninth row, still folded
    fireEvent.click(screen.getByRole('button', { name: 'Show all 11 →' }));
    expect(screen.getByText(/Showing 11 of 11/)).toBeInTheDocument();
    expect(screen.getByText('Extra measure 3')).toBeInTheDocument();
    expect(chips()).toContain('Vetoed');
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
  });

  it('empty table says so instead of rendering a bare header', () => {
    page({
      ...OVERVIEW,
      passed_both: { total: 0, enacted: 0, adopted: 0, vetoed: 0, items: [] },
    });
    expect(
      screen.getByText('No bill in the database has passed both chambers.'),
    ).toBeInTheDocument();
  });

  it('footnote states the real provenance and the nav links to /congress', () => {
    page();
    expect(
      screen.getByText(
        /Composition figures hand-maintained, as of Sep 19, 2026 · bill and vote figures from the Congress\.gov API and Senate\.gov roll calls, refreshed nightly/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Congress' })).toHaveAttribute('href', '/congress');
    expect(screen.getByRole('link', { name: 'Congress' })).toHaveClass('font-semibold');
  });
});
