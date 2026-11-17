import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StockTradesTab } from '@/components/StockTradesTab';
import { buildStockTrades } from '@/lib/model';
import type { StockTradesResponse } from '@/lib/types';
import {
  COTTON_SENATE,
  EXAMPLE_MANY,
  EXAMPLE_MIXED,
  EXAMPLE_SENATE,
  EXAMPLE_TOP_BAND,
  KHANNA_ALL_SCANNED,
  SENATE_NO_FILINGS,
  STEIL_NO_FILINGS,
} from './fixtures';

function tab(response: StockTradesResponse, name = 'Rep. Example') {
  render(<StockTradesTab model={buildStockTrades(response)} name={name} />);
}

const list = () => screen.queryByRole('region', { name: 'Trades' });
const trades = () => (list() ? within(list()!).queryAllByRole('listitem') : []);
const reports = () => screen.getByText(/^All \d+ reports?$/).closest('details')!;

/** EXAMPLE_MIXED with industries, and its newest trade in an industry a committee oversees. */
function withOverlap(): StockTradesResponse {
  const r = structuredClone(EXAMPLE_MIXED);
  r.items[0] = {
    ...r.items[0],
    company: 'EXAMPLE MISSILES CORP',
    sic: 3760,
    industry: 'Guided Missiles & Space Vehicles & Parts',
    overlaps: [
      {
        committee_thomas_id: 'HSAS',
        committee_name: 'House Committee on Armed Services',
        industry: 'Guided missiles and space vehicles',
      },
    ],
  };
  return r;
}

describe('stock trades: states with no trades to list', () => {
  it('says a senator’s eFD has not been read, and that this is a gap, not an empty record', () => {
    tab(COTTON_SENATE, 'Sen. Tom Cotton');
    expect(screen.getByRole('heading', { name: 'Stock trades' })).toBeInTheDocument();
    expect(screen.getByText('Not collected for the Senate yet')).toBeInTheDocument();
    expect(screen.getByText(/not a sign that Sen\. Tom Cotton made no trades/)).toBeInTheDocument();
    const search = screen.getByRole('link', { name: /Search the Senate’s eFD/ });
    expect(search).toHaveAttribute('href', 'https://efdsearch.senate.gov/search/');
    expect(search).toHaveAttribute('target', '_blank');
    expect(screen.queryByText(/No trade reports since/)).not.toBeInTheDocument();
  });

  it('states an empty House record from the day the Congress began, and when it was checked', () => {
    tab(STEIL_NO_FILINGS, 'Rep. Bryan Steil');
    expect(screen.getByText('No trade reports since Jan 3, 2025')).toBeInTheDocument();
    expect(screen.getByText(/The House Clerk lists none for Rep\. Bryan Steil/)).toBeInTheDocument();
    expect(screen.getByText(/Last checked Sep 20, 2026 06:10 UTC/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'What they report owning' })).toHaveAttribute('href', '#annual-disclosure');
    expect(screen.getByText(/Its search is the record/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Source/ })).toHaveAttribute(
      'href',
      'https://disclosures-clerk.house.gov/FinancialDisclosure',
    );
    expect(list()).not.toBeInTheDocument();
  });

  it('states an empty Senate record as what eFD holds', () => {
    tab(SENATE_NO_FILINGS, 'Sen. Tom Cotton');
    expect(screen.getByText(/The Senate’s eFD lists none for Sen\. Tom Cotton/)).toBeInTheDocument();
    expect(screen.queryByText('Not collected for the Senate yet')).not.toBeInTheDocument();
  });
});

describe('stock trades: reports that could not be read', () => {
  it('says scanned paper forms cannot be read and lists every report with its link', () => {
    tab(KHANNA_ALL_SCANNED, 'Rep. Ro Khanna');
    expect(screen.getByText(/3 of 3 reports are scanned paper forms this site cannot read/)).toBeInTheDocument();
    expect(screen.getByText('No trades could be read from these reports.')).toBeInTheDocument();
    const rows = within(reports()).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Filed Sep 4, 2026');
    expect(rows[0]).toHaveTextContent('Scanned paper form');
    expect(rows[0]).toHaveTextContent('18 pages');
    const link = within(rows[0]).getByRole('link', { name: /Report 9116328/ });
    expect(link).toHaveAttribute('href', 'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/9116328.pdf');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('a single scanned report reads in the singular', () => {
    tab({
      ...KHANNA_ALL_SCANNED,
      summary: { ...KHANNA_ALL_SCANNED.summary, filings: 1, filings_scanned: 1 },
      filings: [KHANNA_ALL_SCANNED.filings[0]],
    }, 'Rep. Ro Khanna');
    expect(screen.getByText(/1 of 1 report is a scanned paper form/)).toBeInTheDocument();
  });

  it('flags a report that did not read, with why, beside the ones that did', () => {
    tab(EXAMPLE_MIXED);
    expect(screen.getByText(/1 report could not be read automatically/)).toBeInTheDocument();
    const rows = within(reports()).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Could not be read'),
      expect.stringContaining('Scanned paper form'),
      expect.stringContaining('Trades read'),
    ]);
    expect(rows[0]).toHaveTextContent('row 3 (page 1): amount');
    expect(rows[2]).toHaveTextContent('3 trades');
  });

  it('keeps a Senate report an amendment replaced listed, and does not show its trades', () => {
    tab(EXAMPLE_SENATE, 'Sen. Example');
    const rows = within(reports()).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Amendment 1');
    expect(rows[0]).toHaveTextContent('1 trade');
    expect(rows[1]).toHaveTextContent('Replaced by amendment');
    expect(rows[1]).not.toHaveTextContent(/trade/);
    expect(within(reports()).getByText(/only its trades are shown/)).toBeInTheDocument();
    expect(within(rows[1]).getByRole('link', { name: /Report on eFD/ })).toHaveAttribute(
      'href',
      'https://efdsearch.senate.gov/search/view/ptr/3a779539-8451-49d2-8419-d3eb72c7922a/',
    );
    expect(screen.getByText(/read from|From the Senate’s eFD periodic transaction reports/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Source/ })).toHaveAttribute('title', 'Open the Senate disclosure search');
  });
});

describe('stock trades: the list', () => {
  it('lists trades newest first with type, owner, band, date, delay and the report', () => {
    tab(EXAMPLE_MIXED);
    expect(screen.getByRole('status')).toHaveTextContent('3 trades · 2 buys · 1 sale');
    const [bond, sale, buy] = trades().map((t) => within(t));
    expect(bond.getByRole('heading', { level: 3 })).toHaveTextContent('US Treasury Note 3.5% DUE 01/31/28 (91282CGH8)');
    expect(bond.getByText(/Government securities and agency debt · Self/)).toBeInTheDocument();
    expect(bond.getByText(/Jan 26, 2026/)).toBeInTheDocument();
    expect(bond.getByText(/filed 22 days later/)).toBeInTheDocument();
    expect(bond.queryByText('Filer’s description')).not.toBeInTheDocument();

    expect(sale.getByText('Sale')).toBeInTheDocument();
    expect(sale.getByText('$100,001 – $250,000')).toBeInTheDocument();
    expect(sale.getByText(/sales of 20 shares at \$14\.50/)).toBeInTheDocument();

    expect(buy.getByRole('heading', { level: 3 })).toHaveTextContent('EWW Example Water Works Company, Inc. Common Stock');
    expect(buy.getByText('Purchase')).toBeInTheDocument();
    expect(buy.getByText(/Stocks \(including ADRs\) · Spouse · in Example Advisors LLC/)).toBeInTheDocument();
    const pdf = buy.getByRole('link', { name: /report/ });
    expect(pdf).toHaveAttribute('href', 'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20000001.pdf#page=1');
    expect(pdf).toHaveAttribute('target', '_blank');
  });

  it('keeps a top-band amount as printed', () => {
    tab(EXAMPLE_TOP_BAND);
    expect(screen.getByText('Over $50,000,000')).toBeInTheDocument();
    expect(screen.queryByText(/scanned paper/)).not.toBeInTheDocument();
  });

  it('shows 25 trades at a time and offers the rest', () => {
    tab(EXAMPLE_MANY);
    expect(trades()).toHaveLength(25);
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(trades()).toHaveLength(30);
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('links to the reports list and to the annual disclosure tab', () => {
    tab(EXAMPLE_MIXED);
    expect(screen.getByRole('link', { name: 'list' })).toHaveAttribute('href', '#trade-reports');
    expect(screen.getByRole('link', { name: 'what they own' })).toHaveAttribute('href', '#annual-disclosure');
  });
});

describe('stock trades: filters', () => {
  it('filters to buys or sales, and back', () => {
    tab(EXAMPLE_MIXED);
    fireEvent.click(screen.getByRole('button', { name: 'Sales' }));
    expect(trades()).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('1 trade · 0 buys · 1 sale');
    fireEvent.click(screen.getByRole('button', { name: 'Buys' }));
    expect(trades()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(trades()).toHaveLength(3);
  });

  it('searches company names and tickers', () => {
    tab(EXAMPLE_MIXED);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'eww' } });
    expect(trades()).toHaveLength(1);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'treasury' } });
    expect(trades()).toHaveLength(1);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nothing like this' } });
    expect(trades()).toHaveLength(0);
    expect(screen.getByText('No trades match these filters.')).toBeInTheDocument();
  });

  it('filters by asset type, with counts, and clears', () => {
    tab(EXAMPLE_MIXED);
    const panel = screen.getByRole('complementary', { name: 'Filters' });
    const bonds = within(panel).getByRole('button', { name: /Government securities and agency debt/ });
    expect(bonds).toHaveTextContent('1');
    fireEvent.click(bonds);
    expect(bonds).toHaveAttribute('aria-pressed', 'true');
    expect(trades()).toHaveLength(1);
    fireEvent.click(within(panel).getByRole('button', { name: 'Clear filters' }));
    expect(trades()).toHaveLength(3);
  });

  it('sorts oldest first on request', () => {
    tab(EXAMPLE_MIXED);
    fireEvent.click(screen.getByRole('button', { name: 'Oldest' }));
    expect(within(trades()[0]).getByRole('heading', { level: 3 })).toHaveTextContent('EWW');
  });
});

describe('stock trades: committee industries (ADR 0032)', () => {
  it('marks the trade, names the committee neutrally, and links how this is decided', () => {
    tab(withOverlap());
    const [first, second] = trades();
    expect(first).toHaveTextContent('Guided Missiles & Space Vehicles & Parts');
    expect(
      within(first).getByText(/In an industry the House Committee on Armed Services oversees, a committee this member sits on\./),
    ).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: 'How this is decided' })).toHaveAttribute(
      'href',
      '/methodology/committee-industries',
    );
    expect(second).not.toHaveTextContent(/oversees/);
    // Never a pronoun guessed from a name.
    expect(first).not.toHaveTextContent(/\b(His|Her)\b/);
  });

  it('counts the overlapping trades in the filter, and filters to them', () => {
    tab(withOverlap());
    const toggle = screen.getByRole('checkbox', { name: /In an industry this member’s committees oversee/ });
    expect(screen.getByText(/^1 trade ·/)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(trades()).toHaveLength(1);
    expect(trades()[0]).toHaveTextContent('Armed Services');
  });

  it('offers the filter at zero, so an empty result is visible rather than hidden', () => {
    tab(EXAMPLE_MIXED);
    expect(screen.getByText(/^0 trades ·/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /committees oversee/ }));
    expect(screen.getByText('No trades match these filters.')).toBeInTheDocument();
  });
});

describe('buildStockTrades', () => {
  it('formats and labels without computing: counts and totals are the mart columns', () => {
    const m = buildStockTrades(EXAMPLE_MIXED);
    expect([m.filings, m.filingsParsed, m.filingsScanned, m.filingsFailed]).toEqual([3, 1, 1, 1]);
    expect([m.trades, m.purchases, m.sales, m.exchanges]).toEqual([3, 2, 1, 0]);
    expect(m.purchasesRange).toBe('$30,002 – $100,000');
    expect(m.salesRange).toBe('$100,001 – $250,000');
    expect(m.tradeRows.map((t) => t.key)).toEqual(['20000001-3', '20000001-2', '20000001-1']);
    expect(m.tradeRows.map((t) => t.year)).toEqual(['2026', '2026', '2026']);
    expect(m.overlapTrades).toBe(0);
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

  it('keeps committee names for the row to word', () => {
    const m = buildStockTrades(withOverlap());
    expect(m.tradeRows[0].overlaps).toEqual(['House Committee on Armed Services']);
    expect(m.overlapTrades).toBe(1);
  });

  it('no counts, no ranges', () => {
    const m = buildStockTrades(STEIL_NO_FILINGS);
    expect([m.purchasesRange, m.salesRange, m.firstTrade]).toEqual([null, null, null]);
    expect(m.checkedAt).toBe('Sep 20, 2026 06:10 UTC');
  });
});
