import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnnualDisclosureTab } from '@/components/AnnualDisclosureTab';
import { buildAnnualReports } from '@/lib/model';
import type { AnnualDisclosuresResponse } from '@/lib/types';
import {
  ANNUAL_NONE,
  ANNUAL_PENDING,
  ANNUAL_SENATE_UNREAD,
  HOUSE_READ_ANNUAL,
  KHANNA_ANNUAL,
  SENATE_READ_ANNUAL,
} from './fixtures';

function tab(annual: AnnualDisclosuresResponse, name = 'Sen. Example') {
  render(<AnnualDisclosureTab annual={buildAnnualReports(annual)} name={name} />);
}

const reports = () => screen.getByText(/^All \d+ reports?$/).closest('details')!;
const region = (name: string) => screen.getByRole('region', { name });

describe('annual disclosure: states', () => {
  it('states an empty record, and a listing never read, differently', () => {
    tab(ANNUAL_NONE, 'Rep. Bryan Steil');
    expect(screen.getByText('No annual report since Jan 3, 2025')).toBeInTheDocument();
    expect(screen.getByText('The House Clerk lists none for Rep. Bryan Steil.')).toBeInTheDocument();
    cleanup();
    tab(ANNUAL_SENATE_UNREAD, 'Sen. Tom Cotton');
    expect(screen.getByText('Not collected yet')).toBeInTheDocument();
    expect(screen.getByText(/has not read the Senate’s eFD listing for Sen\. Tom Cotton/)).toBeInTheDocument();
  });

  it('lists reports it has not read, open, with their dates, extensions and links', () => {
    tab(KHANNA_ANNUAL, 'Rep. Ro Khanna');
    expect(screen.getByText(/No report has been read for Rep\. Ro Khanna yet/)).toBeInTheDocument();
    expect(reports()).toHaveAttribute('open');
    const rows = within(reports()).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Annual report for 2025 · filed Aug 10, 2026 · after an extension requested Apr 9, 2026');
    expect(within(rows[0]).getByRole('link', { name: /Report/ })).toHaveAttribute(
      'href',
      'https://disclosures-clerk.house.gov/public_disc/financial-pdfs/2025/9116272.pdf',
    );
    expect(rows[1]).toHaveTextContent('Amended report for 2024');
    expect(rows[1]).not.toHaveTextContent('extension');
  });

  it('shows a report due after an extension as not filed yet, linking the extension', () => {
    tab(ANNUAL_PENDING);
    const row = within(reports()).getByRole('listitem');
    expect(row).toHaveTextContent('Report for 2026: not filed yet · Extension requested May 10, 2027');
    expect(row).not.toHaveTextContent('filed May');
    expect(within(row).getByRole('link', { name: /Extension/ })).toBeInTheDocument();
  });
});

describe('annual disclosure: a read report', () => {
  it('heads with the report, its filing date and link, and shows ranges, never a net worth', () => {
    tab(SENATE_READ_ANNUAL);
    expect(screen.getByText(/Annual report for 2025 · filed Aug 13, 2026/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view report/ })).toHaveAttribute(
      'href',
      'https://efdsearch.senate.gov/search/view/annual/aaaaaaaa-0000-4000-8000-000000000001/',
    );
    expect(screen.getByText('$66,003 – $165,000')).toBeInTheDocument();
    expect(screen.getByText('3 holdings · 1 not valued')).toBeInTheDocument();
    expect(screen.getByText('1 debt').parentElement).toHaveTextContent('$100,001 – $250,000');
    expect(screen.queryByText('-$183,997 – $64,999')).not.toBeInTheDocument();
    expect(screen.getByText(/Not a net worth/)).toBeInTheDocument();
    // One report read: no year switch.
    expect(screen.queryByRole('group', { name: 'Report year' })).not.toBeInTheDocument();
  });

  it('adds up only outside income stated to the dollar, and counts the rest', () => {
    tab(SENATE_READ_ANNUAL);
    const figure = screen.getAllByText('Outside income')[0].parentElement!;
    expect(figure).toHaveTextContent('$172,500');
    expect(figure).toHaveTextContent('1 more without an exact amount');
  });

  it('lists holdings largest first, in their account, never the account, and income only when there was some', () => {
    tab(SENATE_READ_ANNUAL);
    const items = within(region('Holdings')).getAllByRole('listitem');
    expect(items.map((li) => li.firstChild?.firstChild?.textContent)).toEqual([
      'Example Growth Account',
      'Example Stock Account',
      'Example Bank',
      'Family farm partnership',
    ]);
    expect(within(region('Holdings')).queryByText('Spouse retirement plan')).not.toBeInTheDocument();
    expect(within(region('Holdings')).getAllByText(/in Spouse retirement plan/)).toHaveLength(2);
    expect(within(region('Holdings')).getByText('Value not stated by the filer')).toBeInTheDocument();
    expect(items[2]).toHaveTextContent('income Interest: $201 – $1,000');
    expect(items[0]).not.toHaveTextContent('income');
    expect(within(region('Holdings')).getByRole('link', { name: 'their trades' })).toHaveAttribute('href', '#stock-trades');
  });

  it('shows ten holdings, then all on request', () => {
    const many = structuredClone(SENATE_READ_ANNUAL);
    const base = many.latest!.assets[1];
    many.latest!.assets = Array.from({ length: 14 }, (_, i) => ({ ...base, row_label: String(i + 1), asset_name: `Fund ${i + 1}` }));
    tab(many);
    expect(within(region('Holdings')).getAllByRole('listitem')).toHaveLength(11); // ten and the button row
    fireEvent.click(within(region('Holdings')).getByRole('button', { name: 'Show all 14 holdings' }));
    expect(within(region('Holdings')).getAllByRole('listitem')).toHaveLength(14);
  });

  it('shows a holding’s notes, which tell same-named holdings apart', () => {
    const read = structuredClone(SENATE_READ_ANNUAL);
    read.latest!.assets[3].asset_notes = '(NYC, New York); Type: Savings; Filer comment: Account #1 (of 3).';
    tab(read);
    expect(within(region('Holdings')).getByText(/Filer comment: Account #1 \(of 3\)/)).toBeInTheDocument();
  });

  it('lists debts, income, positions and travel; says which read parts list nothing', () => {
    tab(SENATE_READ_ANNUAL);
    const debt = within(region('Debts')).getByRole('listitem');
    expect(debt).toHaveTextContent('Example Mortgage Co.');
    expect(debt).toHaveTextContent('Mortgage · Joint · Incurred 2013 · 8.0% (30 years)');
    const income = within(region('Outside income')).getAllByRole('listitem');
    expect(income[0]).toHaveTextContent('Example Publishing House');
    expect(income[0]).toHaveTextContent('Book advance · Self · New York, NY');
    expect(within(income[1]).getByText('Over $1,000')).toBeInTheDocument();
    expect(within(region('Outside income')).getByText(/investment income is listed with each holding/)).toBeInTheDocument();
    expect(within(region('Outside positions')).getByText('Trustee, Example Family Trust')).toBeInTheDocument();
    expect(within(region('Paid travel')).getByText('Paid by Example Lecture Committee')).toBeInTheDocument();
    expect(screen.getByText(/The report lists no agreements or gifts\./)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Gifts' })).not.toBeInTheDocument();
  });

  it('a House report read only for holdings and debts calls nothing else none', () => {
    tab(HOUSE_READ_ANNUAL, 'Rep. Example');
    const items = within(region('Holdings')).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Example Family Partnership');
    expect(items[0]).toHaveTextContent('$209,630.10');
    expect(screen.getByText('None reported')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Debts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Outside income' })).not.toBeInTheDocument();
    expect(screen.queryByText(/The report lists no/)).not.toBeInTheDocument();
    expect(screen.queryByText('Outside income')).not.toBeInTheDocument();
  });
});

describe('annual disclosure: more than one year read', () => {
  function twoYears(): AnnualDisclosuresResponse {
    const r = structuredClone(SENATE_READ_ANNUAL);
    const older = structuredClone(r.latest!);
    older.covers_year = 2024;
    older.label = 'Annual report for 2024';
    older.filing_date = '2025-08-12';
    older.assets_low = 50003;
    older.assets_high = 130000;
    r.years = [r.latest!, older];
    return r;
  }

  it('switches between the years read, newest first', () => {
    tab(twoYears());
    const years = screen.getByRole('group', { name: 'Report year' });
    expect(within(years).getAllByRole('button').map((b) => b.textContent)).toEqual(['2025', '2024']);
    expect(within(years).getByRole('button', { name: '2025' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(years).getByRole('button', { name: '2024' }));
    expect(screen.getByText(/Annual report for 2024 · filed Aug 12, 2025/)).toBeInTheDocument();
    expect(screen.getByText('$50,003 – $130,000')).toBeInTheDocument();
  });

  it('builds every year, with the newest as the summary', () => {
    const m = buildAnnualReports(twoYears());
    expect(m.years.map((y) => y.year)).toEqual([2025, 2024]);
    expect(m.worth?.year).toBe(2025);
  });
});
