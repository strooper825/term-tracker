import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { excerpt, StatementsTab } from '@/components/StatementsTab';
import { buildStatements } from '@/lib/model';
import { SANDERS_STATEMENTS, STEIL_STATEMENTS } from './fixtures';

const SEARCH = { name: 'Search public statements' };

function feedTab() {
  render(<StatementsTab model={buildStatements(SANDERS_STATEMENTS)!} name="Sen. Bernie Sanders" />);
}

const cards = () => screen.queryAllByRole('article');
const search = (value: string) =>
  fireEvent.change(screen.getByRole('searchbox', SEARCH), { target: { value } });

describe('public statements: a member with a feed', () => {
  it('lists releases newest first, one page at a time', () => {
    feedTab();
    expect(screen.getByRole('heading', { name: 'Press releases' })).toBeInTheDocument();
    expect(screen.getByText(/45 from sanders\.senate\.gov · newest Sep 19, 2026/)).toBeInTheDocument();
    expect(cards()).toHaveLength(25);
    const first = within(cards()[0]);
    const link = first.getByRole('link', { name: /Solar for All/ });
    expect(link).toHaveAttribute(
      'href',
      'https://www.sanders.senate.gov/press-releases/news-sanders-statement-on-federal-judge-restoring-7-billion-forsolar-for-all/',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(first.getByText('Sep 19, 2026')).toBeInTheDocument();
    expect(screen.getByText('Showing 25 of 45')).toBeInTheDocument();
  });

  it('shows plain text with entities decoded, and drops the generic topic', () => {
    feedTab();
    const second = cards()[1];
    expect(within(second).getByText('Technology')).toBeInTheDocument();
    expect(within(second).queryByText('Press Releases')).not.toBeInTheDocument();
    expect(within(second).getByRole('heading', { level: 3 })).toHaveTextContent(
      'PREPARED REMARKS: Sanders: Regulating AI “is as american as apple pie.”',
    );
    expect(second).toHaveTextContent('transforming our economy & our democracy');
    expect(second.innerHTML).not.toContain('&amp;amp;');
    expect(second.innerHTML).not.toContain('<p>');
  });

  it('Show more loads the next page and then goes away', () => {
    feedTab();
    fireEvent.click(screen.getByRole('button', { name: 'Show 20 more' }));
    expect(cards()).toHaveLength(45);
    expect(screen.queryByRole('button', { name: /more/ })).not.toBeInTheDocument();
  });

  it('search covers title and text, says how many match, and marks the match', () => {
    feedTab();
    search('medicare');
    expect(screen.getByRole('status')).toHaveTextContent('1 matching');
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toHaveTextContent('PREPARED REMARKS');
    expect(within(cards()[0]).getByText('Medicare').tagName).toBe('MARK');
  });

  it('every word must match, in any order', () => {
    feedTab();
    search('workweek takano');
    expect(cards()).toHaveLength(1);
    search('workweek medicare');
    expect(cards()).toHaveLength(0);
  });

  it('a match deep in the text shows the stretch around it, not the opening', () => {
    feedTab();
    search('unmistakable-needle');
    expect(cards()).toHaveLength(1);
    const card = cards()[0];
    expect(card).toHaveTextContent('Release number 40');
    expect(within(card).getByText('unmistakable-needle').tagName).toBe('MARK');
    expect(card.textContent).toContain('…');
    expect(card.textContent).not.toContain('Statement 40.');
  });

  it('no match says so, and clearing the search brings the list back', () => {
    feedTab();
    search('zzzzqx');
    expect(screen.getByRole('status')).toHaveTextContent('No press releases match.');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(cards()).toHaveLength(25);
  });

  it('search text is matched literally, not as a pattern', () => {
    feedTab();
    search('$7 (billion');
    expect(screen.getByRole('status')).toHaveTextContent('No press releases match.');
    search('.*');
    expect(screen.getByRole('status')).toHaveTextContent('No press releases match.');
  });

  it('says whose words they are and links the office page as the source', () => {
    feedTab();
    expect(screen.getByText(/These are the office’s words, not this site’s/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^source/ })).toHaveAttribute(
      'href',
      'https://www.sanders.senate.gov/press-releases/',
    );
  });
});

describe('public statements: a member whose office has no feed', () => {
  it('links the press page and offers no search', () => {
    render(<StatementsTab model={buildStatements(STEIL_STATEMENTS)!} name="Rep. Bryan Steil" />);
    const link = screen.getByRole('link', { name: /Press releases on steil\.house\.gov/ });
    expect(link).toHaveAttribute('href', 'https://steil.house.gov/media/press-releases');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/Rep\. Bryan Steil.s office does not publish a press-release feed/)).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(cards()).toHaveLength(0);
  });
});

describe('excerpt', () => {
  const text = `${'Opening words. '.repeat(30)}The needle sits here.${' Tail words.'.repeat(30)}`;

  it('is the opening of the release when there is no search or the match is near the start', () => {
    expect(excerpt('Short release.', [])).toBe('Short release.');
    const opening = excerpt(text, []);
    expect(opening.startsWith('Opening words.')).toBe(true);
    expect(opening.endsWith('…')).toBe(true);
    expect(opening.length).toBeLessThanOrEqual(301);
    expect(excerpt('A needle up front. ' + text, ['needle'])).toMatch(/^A needle up front\./);
  });

  it('is the stretch around a match that only appears further in', () => {
    const around = excerpt(text, ['needle']);
    expect(around).toContain('needle sits here');
    expect(around.startsWith('…') && around.endsWith('…')).toBe(true);
    expect(around.length).toBeLessThanOrEqual(305);
  });
});
