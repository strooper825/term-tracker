import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StockTradesTab } from '@/components/StockTradesTab';
import { buildStockTrades } from '@/lib/model';
import type { StockTradesResponse } from '@/lib/types';
import {
  COTTON_SENATE,
  EXAMPLE_MANY,
  EXAMPLE_MIXED,
  EXAMPLE_TOP_BAND,
  KHANNA_ALL_SCANNED,
  STEIL_NO_FILINGS,
} from './fixtures';

function tab(response: StockTradesResponse, name = 'Rep. Example') {
  render(<StockTradesTab model={buildStockTrades(response)} name={name} />);
}

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
    expect(screen.getByRole('link', { name: /source/ })).toHaveAttribute(
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
