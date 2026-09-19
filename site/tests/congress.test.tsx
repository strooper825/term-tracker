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
    // 533 of 535, not the mockup's self-contradictory "535 of 535 · 3 vacancies"
    expect(screen.getByText('Seated 533 of 535 · 2 vacancies')).toBeInTheDocument();
  });

  it('composition header cites the sources, the as-of date, and that it is manual', () => {
    page();
    const card = screen.getByRole('region', { name: 'Chamber composition' });
    expect(within(card).getByText('All 535 seats')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Clerk of the House' })).toHaveAttribute(
      'href',
      'https://clerk.house.gov/Members',
    );
    expect(within(card).getByRole('link', { name: 'Senate.gov' })).toHaveAttribute(
      'href',
      'https://www.senate.gov/senators/',
    );
    expect(card).toHaveTextContent('as of Sep 19, 2026 · updated manually');
  });

  it('each chamber shows its seats, majority threshold, and margin', () => {
    page();
    expect(screen.getByText('435 seats · 218 for majority')).toBeInTheDocument();
    expect(screen.getByText('100 seats · 51 for majority')).toBeInTheDocument();
    expect(screen.getByText('R +5')).toBeInTheDocument(); // House: 219 with R vs 214
    expect(screen.getByText('R +6')).toBeInTheDocument(); // Senate: 53 vs 47 with D
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
    // A segment too narrow for text carries none; the legend has the count instead.
    expect(house.querySelector('[data-segment="vacant"]')).toHaveTextContent('');
    expect(house.querySelector('[data-segment="republican"]')).toHaveTextContent('218 R');
    const senate = screen.getByRole('img', { name: /^Senate composition/ });
    expect(senate.querySelector('[data-segment="democratic"]')).toHaveTextContent('45 D');
  });

  it('legends count every group, name the caucus, and show vacancies only where there are some', () => {
    page();
    expect(screen.getByText('Republican 218')).toBeInTheDocument();
    expect(screen.getByText('Vacant 2')).toBeInTheDocument();
    expect(screen.getByText('Independent 1 · caucus with R')).toBeInTheDocument();
    expect(screen.getByText('Independent 2 · caucus with D')).toBeInTheDocument();
    expect(screen.getAllByText(/^Vacant/)).toHaveLength(1); // the Senate has none
  });

  it('the scope-change divider is a labelled separator that names the tracked count and links out', () => {
    page();
    const divider = screen.getByRole('separator', { name: 'Scope change' });
    expect(within(divider).getByText('Scope change')).toBeInTheDocument();
    expect(divider).toHaveTextContent(
      'Everything below counts only the 20 members this site tracks — not all 535.',
    );
    expect(within(divider).getByRole('link', { name: /See tracked members/ })).toHaveAttribute(
      'href',
      '/members',
    );
  });

  it('the divider sits between composition and activity in document order', () => {
    page();
    const composition = screen.getByRole('region', { name: 'Chamber composition' });
    const divider = screen.getByRole('separator', { name: 'Scope change' });
    const activity = screen.getByRole('region', { name: /Legislative activity/ });
    const after = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(composition.compareDocumentPosition(divider) & after).toBeTruthy();
    expect(divider.compareDocumentPosition(activity) & after).toBeTruthy();
  });

  it('activity header splits tracked members by chamber from the mart', () => {
    page();
    const section = screen.getByRole('region', { name: /Legislative activity/ });
    expect(section).toHaveTextContent('119th Congress to date · 10 House · 10 Senate');
  });

  it('the eight stats read straight from congress_overview', () => {
    page();
    const stat = (label: string) => screen.getByText(label).parentElement as HTMLElement;
    expect(stat('Bills introduced')).toHaveTextContent('702');
    expect(stat('Bills introduced')).toHaveTextContent('257 House · 445 Senate');
    expect(stat('Passed a chamber')).toHaveTextContent('45');
    expect(stat('Passed a chamber')).toHaveTextContent('22 House-origin · 23 Senate-origin');
    expect(stat('Became law')).toHaveTextContent('0.4% of introduced');
    expect(stat('Vetoed')).toHaveTextContent('0 overridden · 0 not overridden');
    expect(stat('Roll call votes')).toHaveTextContent('14,999');
    expect(stat('Roll call votes')).toHaveTextContent('6,419 House · 8,580 Senate');
    expect(stat('Committee actions')).toHaveTextContent('183');
    expect(stat('Resolutions')).toHaveTextContent('118');
    expect(stat('Still in committee')).toHaveTextContent('604');
    expect(stat('Still in committee')).toHaveTextContent('86.0% of introduced');
  });

  it('the measure-type bar uses the mart shares and every type is counted', () => {
    page();
    const bar = screen.getByRole('img', { name: /^Bills introduced by measure type/ });
    const width = (key: string) =>
      (bar.querySelector(`[data-segment="${key}"]`) as HTMLElement).style.width;
    expect(width('house_bill')).toBe('30.2%');
    expect(width('senate_bill')).toBe('52.99%');
    expect(width('joint_resolution')).toBe('5.27%');
    expect(width('other')).toBe('11.54%');
    expect(bar.querySelector('[data-segment="house_bill"]')).toHaveTextContent('H.R. 212');
    expect(screen.getByText('Joint resolutions 37')).toBeInTheDocument();
    // too narrow to hold text, so only the legend carries the count
    expect(screen.getAllByText('Other 81')).toHaveLength(1);
    expect(bar.querySelector('[data-segment="other"]')).toHaveTextContent('');
  });

  it('passed-both table: outcome, public law, Congress.gov links, and honest vote cells', () => {
    page();
    expect(screen.getByText('6 measures · 3 enacted · 3 adopted · 0 vetoed')).toBeInTheDocument();
    const row = screen.getByRole('link', { name: /H\.R\. 4405/ }).closest('div') as HTMLElement;
    expect(within(row).getByText('427–1')).toBeInTheDocument();
    expect(within(row).getByText('Law 119-38')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /H\.R\. 4405/ })).toHaveAttribute(
      'href',
      'https://www.congress.gov/bill/119th-congress/house-bill/4405',
    );
    expect(within(row).getByRole('link', { name: 'Epstein Files Transparency Act' })).toHaveAttribute(
      'href',
      '/bills/119/hr/4405',
    );
    // A chamber with no passage roll call says so; it does not claim voice vote.
    expect(within(row).getByText('No roll call recorded')).toBeInTheDocument();
    expect(screen.queryByText(/voice vote/i)).not.toBeInTheDocument();
  });

  it('shows no "Show all" control while everything already fits', () => {
    page();
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 6 of 6/)).toBeInTheDocument();
  });

  it('cuts at eight rows and expands in place, with veto and override outcomes', () => {
    page(manyPassed());
    expect(screen.getByText(/Showing 8 of 10/)).toBeInTheDocument();
    expect(screen.queryByText('Extra measure 3')).not.toBeInTheDocument();
    const chips = () =>
      Array.from(document.querySelectorAll('span.rounded-chip.whitespace-nowrap')).map(
        (el) => el.textContent,
      );
    expect(chips()).toContain('Overridden');
    expect(chips()).toContain('Vetoed');
    expect(chips()).toContain('Adopted'); // concurrent resolutions never reach the President
    fireEvent.click(screen.getByRole('button', { name: 'Show all 10 →' }));
    expect(screen.getByText(/Showing 10 of 10/)).toBeInTheDocument();
    expect(screen.getByText('Extra measure 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
  });

  it('empty table says so instead of rendering a bare header', () => {
    page({ ...OVERVIEW, passed_both: { total: 0, enacted: 0, adopted: 0, vetoed: 0, items: [] } });
    expect(
      screen.getByText('No measure sponsored by a tracked member has passed both chambers.'),
    ).toBeInTheDocument();
  });

  it('footnote states the real provenance and the nav links to /congress', () => {
    page();
    expect(
      screen.getByText(/Composition figures hand-maintained, as of Sep 19, 2026 · activity figures from the Congress\.gov API and Senate\.gov roll calls, refreshed nightly/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Congress' })).toHaveAttribute('href', '/congress');
    expect(screen.getByRole('link', { name: 'Congress' })).toHaveClass('font-semibold');
  });
});
