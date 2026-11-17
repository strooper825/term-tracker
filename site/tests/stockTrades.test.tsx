import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StockTradesTab } from '@/components/StockTradesTab';
import { buildAnnualReports, buildStockTrades } from '@/lib/model';
import type { AnnualDisclosuresResponse, StockTradesResponse } from '@/lib/types';
import {
  ANNUAL_NONE,
  ANNUAL_PENDING,
  ANNUAL_SENATE_UNREAD,
  COTTON_SENATE,
  EXAMPLE_MANY,
  EXAMPLE_MIXED,
  EXAMPLE_TOP_BAND,
  EXAMPLE_SENATE,
  KHANNA_ALL_SCANNED,
  HOUSE_READ_ANNUAL,
  KHANNA_ANNUAL,
  SENATE_READ_ANNUAL,
  SENATE_NO_FILINGS,
  STEIL_NO_FILINGS,
} from './fixtures';

function tab(
  response: StockTradesResponse,
  name = 'Rep. Example',
  annual: AnnualDisclosuresResponse = ANNUAL_NONE,
) {
  render(
    <StockTradesTab model={buildStockTrades(response)} annual={buildAnnualReports(annual)} name={name} />,
  );
}

const annualSection = () => screen.getByRole('region', { name: 'Annual financial disclosures' });

const trades = () => screen.queryAllByRole('article');

describe('stock trades: a senator', () => {
  it('says the data is not available for the Senate, and is not a coming-soon panel', () => {
    tab(COTTON_SENATE, 'Sen. Tom Cotton');
    expect(screen.getByRole('heading', { name: 'Stock trades' })).toBeInTheDocument();
    expect(screen.getByText('Not available for the Senate')).toBeInTheDocument();
    expect(
      screen.getByText(/not a sign that Sen\. Tom Cotton has made no trades/),
    ).toBeInTheDocument();
    const search = screen.getByRole('link', { name: /Search Sen\. Tom Cotton on the Senate disclosure site/ });
    expect(search).toHaveAttribute('href', 'https://efdsearch.senate.gov/search/');
    expect(search).toHaveAttribute('target', '_blank');
    // Not the locked placeholder, and not an empty record either.
    expect(screen.queryByText('Coming in a future release')).not.toBeInTheDocument();
    expect(screen.queryByText(/not yet published/)).not.toBeInTheDocument();
    expect(screen.queryByText('No reports on file')).not.toBeInTheDocument();
    expect(screen.queryByText('Reports filed')).not.toBeInTheDocument();
  });
});

describe('annual financial disclosures', () => {
  it('lists each report with its date, extension and link, above the trades', () => {
    tab(KHANNA_ALL_SCANNED, 'Rep. Ro Khanna', KHANNA_ANNUAL);
    const section = annualSection();
    const rows = within(section).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Annual report for 2025')).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('Filed Aug 10, 2026 \u00b7 after an extension requested Apr 9, 2026');
    expect(within(rows[0]).getByRole('link', { name: /Report/ })).toHaveAttribute(
      'href',
      'https://disclosures-clerk.house.gov/public_disc/financial-pdfs/2025/9116272.pdf',
    );
    expect(within(rows[1]).getByText('Amended report for 2024')).toBeInTheDocument();
    expect(rows[1]).not.toHaveTextContent('extension');
    expect(within(section).getByText(/does not read them yet/)).toBeInTheDocument();
    // The section comes before the trades on the tab.
    const order = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(order.indexOf('Annual financial disclosures')).toBeLessThan(order.indexOf('Stock trades'));
  });

  it('shows a report due after an extension as not filed yet, linking the extension', () => {
    tab(STEIL_NO_FILINGS, 'Rep. Example', ANNUAL_PENDING);
    const row = within(annualSection()).getByRole('listitem');
    expect(row).toHaveTextContent('Report for 2026: not filed yet');
    expect(row).toHaveTextContent('Extension requested May 10, 2027');
    expect(row).not.toHaveTextContent('Filed');
    expect(within(row).getByRole('link', { name: /Extension/ })).toBeInTheDocument();
  });

  it('states an empty record, and a listing never read, differently', () => {
    tab(STEIL_NO_FILINGS, 'Rep. Bryan Steil', ANNUAL_NONE);
    expect(within(annualSection()).getByText(/lists no annual report for Rep\. Bryan Steil since Jan 3, 2025/)).toBeInTheDocument();
    cleanup();
    tab(COTTON_SENATE, 'Sen. Tom Cotton', ANNUAL_SENATE_UNREAD);
    expect(within(annualSection()).getByText(/Not collected yet for Sen\. Tom Cotton/)).toBeInTheDocument();
    expect(within(annualSection()).queryByRole('listitem')).not.toBeInTheDocument();
  });
});

describe('annual financial disclosures: a read report', () => {
  it('shows reported assets and debts as ranges, and no net worth', () => {
    tab(EXAMPLE_SENATE, 'Sen. Example', SENATE_READ_ANNUAL);
    const section = annualSection();
    expect(within(section).getByText('Reported assets, 2025')).toBeInTheDocument();
    expect(within(section).getByText('$66,003 \u2013 $165,000')).toBeInTheDocument();
    expect(within(section).getByText('3 holdings \u00b7 1 not valued')).toBeInTheDocument();
    expect(within(section).getByText('Reported debts, 2025')).toBeInTheDocument();
    expect(within(section).getByText('$100,001 \u2013 $250,000')).toBeInTheDocument();
    expect(within(section).getByText('1 debt')).toBeInTheDocument();
    // Homes need not be listed but their mortgages usually are, so no net figure is shown.
    expect(within(section).queryByText(/net worth,/i)).not.toBeInTheDocument();
    expect(within(section).queryByText('-$183,997 \u2013 $64,999')).not.toBeInTheDocument();
    expect(within(section).getByText(/The two are not a net worth/)).toBeInTheDocument();
    expect(within(section).getByText(/summarised below/)).toBeInTheDocument();
  });

  it('lists holdings largest first, inside their account, and never the account itself', () => {
    tab(EXAMPLE_SENATE, 'Sen. Example', SENATE_READ_ANNUAL);
    const list = screen.getByRole('region', { name: 'Holdings' });
    const names = within(list).getAllByRole('listitem').map((li) => li.firstChild?.firstChild?.textContent);
    expect(names).toEqual([
      'Example Growth Account',
      'Example Stock Account',
      'Example Bank',
      'Family farm partnership',
    ]);
    expect(within(list).queryByText('Spouse retirement plan')).not.toBeInTheDocument();
    expect(within(list).getAllByText(/in Spouse retirement plan/)).toHaveLength(2);
    expect(within(list).getByText('Value not stated by the filer')).toBeInTheDocument();
    expect(within(list).getByText('Income Interest: $201 - $1,000')).toBeInTheDocument();
  });

  it('lists the debts', () => {
    tab(EXAMPLE_SENATE, 'Sen. Example', SENATE_READ_ANNUAL);
    const list = screen.getByRole('region', { name: 'Debts' });
    expect(within(list).getByText('Mortgage \u00b7 Example Mortgage Co.')).toBeInTheDocument();
    expect(within(list).getByText('Joint \u00b7 Incurred 2013 \u00b7 8.0% (30 years)')).toBeInTheDocument();
  });

  it('shows ten holdings, then all on request', () => {
    const many = structuredClone(SENATE_READ_ANNUAL);
    const base = many.latest!.assets[1];
    many.latest!.assets = Array.from({ length: 14 }, (_, i) => ({
      ...base,
      row_label: String(i + 1),
      asset_name: `Fund ${i + 1}`,
    }));
    tab(EXAMPLE_SENATE, 'Sen. Example', many);
    const list = screen.getByRole('region', { name: 'Holdings' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
    fireEvent.click(within(list).getByRole('button', { name: 'Show all 14' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(14);
  });
});

describe('annual financial disclosures: the rest of a Senate report (ADR 0030)', () => {
  it('lists outside income, an exact figure rounded and a spouse’s as over $1,000', () => {
    tab(EXAMPLE_SENATE, 'Sen. Example', SENATE_READ_ANNUAL);
    const list = screen.getByRole('region', { name: 'Outside income' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Example Publishing House');
    expect(within(items[0]).getByText('Book advance · Self · New York, NY')).toBeInTheDocument();
    expect(within(items[0]).getByText('$172,500')).toBeInTheDocument();
    expect(within(items[1]).getByText('Over $1,000')).toBeInTheDocument();
    expect(within(list).getByText(/investment income is listed with each holding/)).toBeInTheDocument();
  });

  it('lists positions and paid travel with the filer’s words', () => {
    tab(EXAMPLE_SENATE, 'Sen. Example', SENATE_READ_ANNUAL);
    const positions = screen.getByRole('region', { name: 'Outside positions' });
    expect(within(positions).getByText('Trustee, Example Family Trust')).toBeInTheDocument();
    expect(within(positions).getByText('Trust · Burlington, VT · Aug 2016 to present')).toBeInTheDocument();
    expect(within(positions).getByText('A co-trustee of a family trust.')).toBeInTheDocument();
    const travel = screen.getByRole('region', { name: 'Paid travel' });
    expect(within(travel).getByText('Paid by Example Lecture Committee')).toBeInTheDocument();
    expect(within(travel).getByText(/May 22, 2025 – May 28, 2025 · Self, Spouse/)).toBeInTheDocument();
  });

  it('says which read parts list nothing, and shows no empty section', () => {
    tab(EXAMPLE_SENATE, 'Sen. Example', SENATE_READ_ANNUAL);
    expect(within(annualSection()).getByText('The report lists no agreements or gifts.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Gifts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Agreements' })).not.toBeInTheDocument();
  });

  it('shows a gift with its giver, date and value', () => {
    const read = structuredClone(SENATE_READ_ANNUAL);
    read.latest!.gifts = [
      {
        gift_date: '2025-09-21',
        owner_label: 'Self',
        gift: 'Ticket to a football game',
        value_raw: '$772.31',
        value: 772.31,
        giver: 'A friend',
        giver_location: 'St. Louis, MO',
        comments: 'Approved by the Ethics Committee.',
      },
    ];
    tab(EXAMPLE_SENATE, 'Sen. Example', read);
    const gifts = screen.getByRole('region', { name: 'Gifts' });
    expect(within(gifts).getByText('From A friend · St. Louis, MO · to Self · Sep 21, 2025')).toBeInTheDocument();
    expect(within(gifts).getByText('$772')).toBeInTheDocument();
    expect(within(annualSection()).getByText('The report lists no agreements.')).toBeInTheDocument();
  });
});

describe('annual financial disclosures: the rest of a House report (ADR 0031)', () => {
  function houseWithSections(): AnnualDisclosuresResponse {
    const read = structuredClone(HOUSE_READ_ANNUAL);
    Object.assign(read.latest!, {
      income: [
        {
          owner_label: null,
          income_type: 'Spouse Salary',
          income_detail: null,
          payer: 'Example Clinic',
          payer_location: null,
          amount_raw: 'N/A',
          amount_kind: 'not_stated',
          amount_low: null,
          amount_high: null,
          amount_period: null,
          comments: null,
        },
        {
          owner_label: null,
          income_type: 'Salary',
          income_detail: null,
          payer: 'Example Commission',
          payer_location: null,
          amount_raw: '$127,500.00',
          amount_kind: 'exact',
          amount_low: 127500,
          amount_high: 127500,
          amount_period: 'Preceding year',
          comments: null,
        },
      ],
      positions: [
        {
          position_dates: null,
          is_current: null,
          position_held: 'Board Member (uncompensated)',
          entity: 'Example University',
          entity_location: null,
          entity_type: null,
          comments: null,
        },
      ],
      agreements: [
        {
          agreement_date: 'June 1992',
          parties: 'Myself and Example Retirement System',
          parties_location: null,
          agreement_type: null,
          terms: 'Retirement Pension',
          comments: null,
        },
      ],
      gifts: [
        {
          gift_date: null,
          owner_label: null,
          gift: 'Birthday Gift',
          value_raw: '$500.00',
          value: 500,
          giver: 'A friend',
          giver_location: 'Durham, NC, US',
          comments: null,
        },
      ],
      travel: [
        {
          departed: '2025-04-12',
          returned: '2025-04-24',
          travelers: null,
          travel_type: null,
          itinerary: 'New York - Tokyo - New York',
          reimbursed_for: null,
          sponsor: 'Example Foundation',
          sponsor_location: null,
          days_at_own_expense: 6,
          comments: null,
        },
      ],
    });
    return read;
  }

  it('shows income without an owner, and a source listed without its amount', () => {
    tab(STEIL_NO_FILINGS, 'Rep. Example', houseWithSections());
    const items = within(screen.getByRole('region', { name: 'Outside income' })).getAllByRole('listitem');
    expect(within(items[0]).getByText('Spouse Salary')).toBeInTheDocument();
    expect(within(items[0]).getByText('No amount given')).toBeInTheDocument();
    expect(within(items[1]).getByText('Salary · Preceding year')).toBeInTheDocument();
    expect(within(items[1]).getByText('$127,500')).toBeInTheDocument();
    const note = within(screen.getByRole('region', { name: 'Outside income' }));
    expect(note.getByText(/listed by source alone, without an amount/)).toBeInTheDocument();
    expect(note.queryByText(/over \$1,000/)).not.toBeInTheDocument();
  });

  it('shows what the House prints and leaves out what it does not', () => {
    tab(STEIL_NO_FILINGS, 'Rep. Example', houseWithSections());
    const positions = screen.getByRole('region', { name: 'Outside positions' });
    expect(within(positions).getByText('Board Member (uncompensated), Example University')).toBeInTheDocument();
    const agreements = screen.getByRole('region', { name: 'Agreements' });
    expect(within(agreements).getByText('Myself and Example Retirement System')).toBeInTheDocument();
    const gifts = screen.getByRole('region', { name: 'Gifts' });
    expect(within(gifts).getByText('From A friend · Durham, NC, US')).toBeInTheDocument();
    const travel = screen.getByRole('region', { name: 'Paid travel' });
    expect(within(travel).getByText('Apr 12, 2025 – Apr 24, 2025 · 6 days at own expense')).toBeInTheDocument();
    expect(within(annualSection()).queryByText(/The report lists no/)).not.toBeInTheDocument();
  });
});

describe('annual financial disclosures: a read House report', () => {
  it('shows no sections and calls nothing none for a report not yet read past A and D', () => {
    tab(STEIL_NO_FILINGS, 'Rep. Example', HOUSE_READ_ANNUAL);
    expect(screen.queryByRole('region', { name: 'Outside income' })).not.toBeInTheDocument();
    expect(within(annualSection()).queryByText(/The report lists no/)).not.toBeInTheDocument();
  });

  it('names each holding\u2019s account and keeps an exact figure as printed', () => {
    tab(STEIL_NO_FILINGS, 'Rep. Example', HOUSE_READ_ANNUAL);
    const list = screen.getByRole('region', { name: 'Holdings' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((li) => li.firstChild?.firstChild?.textContent)).toEqual([
      'Example Family Partnership',
      'Example Growth Fund',
      'Closed Savings Account',
    ]);
    expect(items[0]).toHaveTextContent('$209,630.10');
    expect(items[1]).toHaveTextContent('in EXAMPLE SECURITIES BROKERAGE ACCOUNT');
    expect(within(annualSection()).getByText('Reported debts, 2025')).toBeInTheDocument();
    expect(within(annualSection()).getByText('None reported')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Debts' })).not.toBeInTheDocument();
  });
});

describe('stock trades: a senator once eFD is read', () => {
  it('lists the trades and says they come from eFD', () => {
    tab(EXAMPLE_SENATE, 'Sen. Example', ANNUAL_SENATE_UNREAD);
    expect(trades()).toHaveLength(2);
    expect(screen.queryByText('Not available for the Senate')).not.toBeInTheDocument();
    expect(screen.getByText(/read from the Senate\u2019s eFD periodic transaction reports/)).toBeInTheDocument();
    expect(screen.queryByText(/House Clerk/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Source/ })).toHaveAttribute(
      'title',
      'Open the Senate disclosure search',
    );
  });

  it('keeps a replaced report listed, marks it, and does not count its trades', () => {
    tab(EXAMPLE_SENATE, 'Sen. Example');
    const reports = screen.getByRole('region', { name: 'All reports' });
    const rows = within(reports).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Amendment 1')).toBeInTheDocument();
    expect(within(rows[0]).getByText('1 trade')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Replaced by amendment')).toBeInTheDocument();
    expect(within(rows[1]).queryByText(/trade/)).not.toBeInTheDocument();
    expect(within(reports).getByText(/only the amendment\u2019s trades are counted/)).toBeInTheDocument();
    // eFD report ids are UUIDs: the link names the system, not the id.
    expect(within(rows[1]).getByRole('link', { name: /Report on eFD/ })).toHaveAttribute(
      'href',
      'https://efdsearch.senate.gov/search/view/ptr/3a779539-8451-49d2-8419-d3eb72c7922a/',
    );
  });

  it('states an empty Senate record as what eFD holds', () => {
    tab(SENATE_NO_FILINGS, 'Sen. Tom Cotton');
    expect(screen.getByText('No reports on file')).toBeInTheDocument();
    expect(
      screen.getByText(/disclosure search \(eFD\) lists no periodic transaction reports for Sen\. Tom Cotton/),
    ).toBeInTheDocument();
    expect(screen.getByText('Search last checked Nov 16, 2026 18:10 UTC')).toBeInTheDocument();
    expect(screen.queryByText('Not available for the Senate')).not.toBeInTheDocument();
  });
});

describe('stock trades: a House member the Clerk lists no report for', () => {
  it('states an empty record, from the date the tracked Congress began', () => {
    tab(STEIL_NO_FILINGS, 'Rep. Bryan Steil');
    expect(screen.getByText('No reports on file')).toBeInTheDocument();
    expect(
      screen.getByText(/lists no periodic transaction reports for Rep\. Bryan Steil since Jan 3, 2025/),
    ).toBeInTheDocument();
    expect(screen.getByText('Index last checked Sep 20, 2026 06:10 UTC')).toBeInTheDocument();
    // distinct from the Senate message
    expect(screen.queryByText('Not available for the Senate')).not.toBeInTheDocument();
    expect(screen.queryByText('Coming in a future release')).not.toBeInTheDocument();
    expect(trades()).toHaveLength(0);
    expect(screen.getByRole('link', { name: /^Source/ })).toHaveAttribute(
      'href',
      'https://disclosures-clerk.house.gov/FinancialDisclosure',
    );
  });
});

describe('stock trades: a member whose reports are all scanned paper forms', () => {
  it('counts them, lists trades as none, and links each PDF', () => {
    tab(KHANNA_ALL_SCANNED, 'Rep. Ro Khanna');
    const figures = screen.getByText('Reports filed').parentElement!;
    expect(figures).toHaveTextContent('3');
    expect(figures).toHaveTextContent('0 read · 3 not readable');
    expect(screen.getByText('Trades listed').parentElement).toHaveTextContent('0');
    // No value totals when there are no trades to add up
    expect(screen.queryByText('Purchases, combined value')).not.toBeInTheDocument();
    expect(screen.getByText('No trades can be listed')).toBeInTheDocument();
    expect(screen.getByText(/3 of 3 reports are scanned paper forms/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Trades' })).not.toBeInTheDocument();

    const list = screen.getByRole('heading', { name: 'All reports' }).closest('section')!;
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Filed Sep 4, 2026');
    expect(rows[0]).toHaveTextContent('Scanned paper form');
    expect(rows[0]).toHaveTextContent('18 pages');
    const link = within(rows[0]).getByRole('link', { name: 'Report 9116328' });
    expect(link).toHaveAttribute(
      'href',
      'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/9116328.pdf',
    );
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('a single scanned report reads in the singular', () => {
    const one: StockTradesResponse = {
      ...KHANNA_ALL_SCANNED,
      summary: { ...KHANNA_ALL_SCANNED.summary, filings: 1, filings_scanned: 1 },
      filings: [KHANNA_ALL_SCANNED.filings[0]],
    };
    tab(one, 'Rep. Ro Khanna');
    expect(screen.getByText(/1 of 1 report is a scanned paper form/)).toBeInTheDocument();
  });
});

describe('stock trades: a member with read reports', () => {
  it('summarises with mart totals, and says the totals bracket the truth', () => {
    tab(EXAMPLE_MIXED);
    expect(screen.getByText('Reports filed').parentElement).toHaveTextContent('3');
    expect(screen.getByText('Reports filed').parentElement).toHaveTextContent('1 read · 2 not readable');
    expect(screen.getByText('Trades listed').parentElement).toHaveTextContent('3');
    expect(screen.getByText('Trades listed').parentElement).toHaveTextContent('2 purchases · 1 sales');
    expect(screen.getByText('Purchases, combined value').parentElement).toHaveTextContent(
      '$30,002 – $100,000',
    );
    expect(screen.getByText('Sales, combined value').parentElement).toHaveTextContent(
      '$100,001 – $250,000',
    );
    expect(screen.getByText(/the true total lies between them/)).toBeInTheDocument();
  });

  it('lists trades newest first with owner, type, band, and a link to the PDF page', () => {
    tab(EXAMPLE_MIXED);
    expect(trades()).toHaveLength(3);
    const [bond, sale, buy] = trades().map((t) => within(t));
    expect(bond.getByRole('heading', { level: 3 })).toHaveTextContent(
      'US Treasury Note 3.5% DUE 01/31/28 (91282CGH8)',
    );
    expect(bond.getByText('Jan 26, 2026')).toBeInTheDocument();
    expect(bond.getByText(/Government securities and agency debt · Self/)).toBeInTheDocument();
    expect(bond.getByText('Filed 22 days later')).toBeInTheDocument();

    expect(sale.getByText('Sale')).toBeInTheDocument();
    expect(sale.getByText('$100,001 - $250,000')).toBeInTheDocument();
    expect(sale.getByText('Filer’s description')).toBeInTheDocument();
    expect(sale.getByText(/sales of 20 shares at \$14\.50/)).toBeInTheDocument();

    expect(buy.getByRole('heading', { level: 3 })).toHaveTextContent(
      'Example Water Works Company, Inc. Common Stock · EWW',
    );
    expect(buy.getByText('Purchase')).toBeInTheDocument();
    expect(buy.getByText(/Stocks \(including ADRs\) · Spouse · held in Example Advisors LLC/)).toBeInTheDocument();
    expect(buy.getByText('$15,001 - $50,000')).toBeInTheDocument();
    expect(buy.getByText('Filed 34 days later')).toBeInTheDocument();
    const pdf = buy.getByRole('link', { name: /report/ });
    expect(pdf).toHaveAttribute(
      'href',
      'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20000001.pdf#page=1',
    );
    expect(pdf).toHaveAttribute('target', '_blank');
    // a trade with no description shows no toggle
    expect(bond.queryByText('Filer’s description')).not.toBeInTheDocument();
  });

  it('flags every report that could not be listed, with why', () => {
    tab(EXAMPLE_MIXED);
    expect(screen.getByText('Some trades cannot be listed')).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 reports is a scanned paper form/)).toBeInTheDocument();
    expect(screen.getByText(/1 report could not be read automatically and is flagged below/)).toBeInTheDocument();
    const list = screen.getByRole('heading', { name: 'All reports' }).closest('section')!;
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Could not be read'),
      expect.stringContaining('Scanned paper form'),
      expect.stringContaining('Trades read'),
    ]);
    expect(rows[0]).toHaveTextContent('row 3 (page 1): amount');
    expect(rows[2]).toHaveTextContent('3 trades');
  });

  it('a top-band trade has no upper end, so the combined value reads "or more"', () => {
    tab(EXAMPLE_TOP_BAND);
    expect(screen.getByText('Purchases, combined value').parentElement).toHaveTextContent(
      '$50,000,000 or more',
    );
    expect(screen.queryByText('Sales, combined value')).not.toBeInTheDocument();
    expect(screen.getByText('Over $50,000,000')).toBeInTheDocument();
    expect(screen.queryByText('No trades can be listed')).not.toBeInTheDocument();
    expect(screen.getByText('Reports filed').parentElement).toHaveTextContent('all read');
  });

  it('shows 25 trades at a time and offers the rest', () => {
    tab(EXAMPLE_MANY);
    expect(trades()).toHaveLength(25);
    expect(screen.getByText('Showing 25 of 30')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show 5 more' }));
    expect(trades()).toHaveLength(30);
    expect(screen.queryByRole('button', { name: /more/ })).not.toBeInTheDocument();
  });

  it('warns that reading a PDF can go wrong and points to the report as the record', () => {
    tab(EXAMPLE_MIXED);
    expect(screen.getByText(/check a trade against its report before relying on it/)).toBeInTheDocument();
  });
});

describe('buildStockTrades', () => {
  it('formats and labels without computing: counts and totals are the mart columns', () => {
    const m = buildStockTrades(EXAMPLE_MIXED);
    expect([m.filings, m.filingsParsed, m.filingsScanned, m.filingsFailed]).toEqual([3, 1, 1, 1]);
    expect([m.trades, m.purchases, m.sales, m.exchanges]).toEqual([3, 2, 1, 0]);
    expect(m.purchasesRange).toBe('$30,002 – $100,000');
    expect(m.salesRange).toBe('$100,001 – $250,000');
    expect([m.firstTrade, m.lastTrade]).toEqual(['Jan 14, 2026', 'Jan 26, 2026']);
    expect(m.tradeRows.map((t) => t.key)).toEqual(['20000001-3', '20000001-2', '20000001-1']);
  });

  it('a range with equal ends (one exact amount) reads as one figure', () => {
    const m = buildStockTrades({
      ...EXAMPLE_MIXED,
      summary: { ...EXAMPLE_MIXED.summary, purchases_low: 1973, purchases_high: 1973 },
    });
    expect(m.purchasesRange).toBe('$1,973');
  });

  it('a same-day filing and a one-day gap read naturally', () => {
    const m = buildStockTrades({
      ...EXAMPLE_MIXED,
      items: [
        { ...EXAMPLE_MIXED.items[0], days_to_file: 0 },
        { ...EXAMPLE_MIXED.items[1], days_to_file: 1 },
      ],
    });
    expect(m.tradeRows.map((t) => t.filedLabel)).toEqual(['Filed the same day', 'Filed 1 day later']);
  });

  it('no counts, no ranges', () => {
    const m = buildStockTrades(STEIL_NO_FILINGS);
    expect([m.purchasesRange, m.salesRange, m.firstTrade]).toEqual([null, null, null]);
    expect(m.checkedAt).toBe('Sep 20, 2026 06:10 UTC');
  });
});

it('names the report the figures come from, with its filing date', () => {
  tab(EXAMPLE_SENATE, 'Sen. Example', SENATE_READ_ANNUAL);
  expect(within(annualSection()).getByRole('link', { name: /filed Aug 13, 2026/ })).toHaveAttribute(
    'href',
    'https://efdsearch.senate.gov/search/view/annual/aaaaaaaa-0000-4000-8000-000000000001/',
  );
});

it('shows a holding’s notes, which tell same-named holdings apart', () => {
  const read = structuredClone(SENATE_READ_ANNUAL);
  read.latest!.assets[3].asset_notes = '(NYC, New York); Type: Savings; Filer comment: Account #1 (of 3).';
  tab(EXAMPLE_SENATE, 'Sen. Example', read);
  const list = screen.getByRole('region', { name: 'Holdings' });
  expect(within(list).getByText(/Filer comment: Account #1 \(of 3\)/)).toBeInTheDocument();
});
