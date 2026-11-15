import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BillBrowser } from '@/components/BillBrowser';
import { PAGE, VOTE, type BillRow } from '@/lib/billIndex';

const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const RECENT: BillRow[] = [
  ['hr', '1', 'H.R. 1', 'A Law', 'Health', day(1), 'Became Public Law.', 'Pat Example', 'D', 'WI', 12, 5, VOTE | PAGE],
  ['s', '2', 'S. 2', 'A Senate Bill', 'Taxation', day(2), 'Passed Senate.', 'Sam Rivers', 'R', 'AR', 3, 3, 0],
  ['hr', '3', 'H.R. 3', 'Just Introduced', 'Health', day(3), 'Referred to committee.', 'Pat Example', 'D', 'WI', 0, 1, 0],
];
const ALL: BillRow[] = [...RECENT, ['hr', '9', 'H.R. 9', 'An Old Bill', 'Energy', day(200), 'Referred.', 'Lee Old', 'R', 'TX', 1, 1, 0]];

let fetchMock: ReturnType<typeof vi.fn>;

async function show(search = '') {
  window.history.replaceState(null, '', `/bills${search}`);
  await act(async () => {
    render(<BillBrowser />);
  });
  await waitFor(() => expect(screen.getByRole('status')).not.toHaveTextContent('Loading'));
}
const titles = () => screen.getAllByRole('listitem').map((li) => li.querySelector('a')!.textContent);

beforeEach(() => {
  fetchMock = vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(url.includes('recent') ? { congress: 119, total: 4, topics: ['Energy', 'Health', 'Taxation'], rows: RECENT } : { congress: 119, rows: ALL }),
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('BillBrowser', () => {
  it('opens on this week, most important first, from the short file only', async () => {
    await show();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bills in the 119th Congress');
    expect(screen.getByRole('status')).toHaveTextContent('3 bills');
    expect(titles()).toEqual(['H.R. 1 A Law', expect.stringContaining('S. 2 A Senate Bill'), expect.stringContaining('H.R. 3 Just Introduced')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/bills/data/recent.json');
    // our own page where there is one, Congress.gov where there is not
    expect(screen.getByRole('link', { name: /H\.R\. 1 A Law/ })).toHaveAttribute('href', '/bills/119/hr/1');
    expect(screen.getByRole('link', { name: /S\. 2 A Senate Bill/ })).toHaveAttribute('href', 'https://www.congress.gov/bill/119th-congress/senate-bill/2');
    // a row says how far the bill got and nothing more; the bill's own page has the detail
    expect(screen.queryByText('Floor vote')).toBeNull();
    expect(screen.getByText('Became law', { selector: 'li span' })).toBeInTheDocument();
  });

  it('a filter narrows the list and goes into the address', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: /Became law/ }));
    expect(screen.getByRole('status')).toHaveTextContent('1 bill');
    expect(window.location.search).toBe('?stage=law');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'Taxation' } });
    expect(titles()).toEqual([expect.stringContaining('S. 2')]);
    expect(window.location.search).toBe('?topic=Taxation');
  });

  it('a search fetches the whole Congress and ignores the time filter', async () => {
    await show();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'old bill' } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 bill'));
    expect(fetchMock).toHaveBeenCalledWith('/bills/data/all.json');
    expect(titles()).toEqual([expect.stringContaining('H.R. 9 An Old Bill')]);
    expect(screen.getByRole('status')).toHaveTextContent('across the whole Congress');
  });

  it('a linked view opens as it was saved', async () => {
    await show('?moved=all&party=republican&sort=latest');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 bills'));
    expect(titles()).toEqual([expect.stringContaining('S. 2'), expect.stringContaining('H.R. 9')]);
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Republican' })).toHaveAttribute('aria-pressed', 'true');
    expect(window.location.search).toBe('?moved=all&party=republican&sort=latest');
  });
});
