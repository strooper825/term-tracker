import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BillPage } from '@/components/BillPage';
import { buildBillPage, buildJourney, memberMeta, sanitizeSummaryHtml } from '@/lib/model';
import {
  AMENDMENT,
  BILL,
  BILL_NO_SUMMARY,
  FAILED_JOURNEY,
  LAW_JOURNEY,
  PASSED_HOUSE_JOURNEY,
} from './fixtures';

const TRAIL = [{ label: 'Members', href: '/members' }];

function page(detail = BILL) {
  return <BillPage bill={buildBillPage(detail)} trail={TRAIL} lastUpdated="Sep 13, 2026 02:09 UTC" />;
}

describe('summary HTML is sanitised before it reaches the page', () => {
  it('keeps formatting tags and drops everything else, attributes included', () => {
    expect(sanitizeSummaryHtml('<p><strong>Act</strong></p>')).toBe('<p><strong>Act</strong></p>');
    expect(sanitizeSummaryHtml('<ul><li>one</li><li>two</li></ul>')).toBe(
      '<ul><li>one</li><li>two</li></ul>',
    );
    // attributes are stripped even from allowed tags
    expect(sanitizeSummaryHtml('<p class="x" onclick="alert(1)">hi</p>')).toBe('<p>hi</p>');
    // a link becomes plain text
    expect(sanitizeSummaryHtml('see <a href="http://evil.test">this</a>')).toBe('see this');
  });

  it('removes scripts, styles, comments, and unknown tags but keeps their words', () => {
    expect(sanitizeSummaryHtml('<script>alert(1)</script><p>safe</p>')).toBe('<p>safe</p>');
    expect(sanitizeSummaryHtml('<style>p{color:red}</style><p>safe</p>')).toBe('<p>safe</p>');
    expect(sanitizeSummaryHtml('<!-- hidden --><p>safe</p>')).toBe('<p>safe</p>');
    expect(sanitizeSummaryHtml('<iframe src="x"></iframe><p>safe</p>')).toBe('<p>safe</p>');
    expect(sanitizeSummaryHtml('<div>kept text</div>')).toBe('kept text');
    expect(sanitizeSummaryHtml('<img src=x onerror=alert(1)>')).toBe('');
  });

  it('normalises self-closing and upper-case tags', () => {
    expect(sanitizeSummaryHtml('a<BR/>b')).toBe('a<br>b');
    expect(sanitizeSummaryHtml('<P>x</P>')).toBe('<p>x</p>');
  });
});

describe('bill page model', () => {
  it('member meta reads as party-state-district, or party-state in the Senate', () => {
    expect(memberMeta('R', 'WI', 1)).toBe('R-WI-1');
    expect(memberMeta('R', 'AR', null)).toBe('R-AR');
  });

  it('formats the header, the latest summary, and its version history', () => {
    const m = buildBillPage(BILL);
    expect(m.label).toBe('H.R. 5269');
    expect(m.kindLabel).toBe('Bill');
    expect(m.congress).toBe('119th Congress');
    expect(m.introduced).toBe('Sep 10, 2025');
    expect(m.sponsorName).toBe('Tammy Baldwin');
    expect(m.sponsorMeta).toBe('Democrat · WI-2');
    expect(m.sponsorHref).toBeNull(); // not a tracked member
    expect(m.latestAction).toEqual({
      date: 'Sep 11, 2025',
      text: 'Referred to the Committee on Energy and Commerce.',
    });
    expect(m.summary?.asOf).toBe('Jan 14, 2026');
    expect(m.summary?.stage).toBe('Passed House');
    expect(m.summary?.html).toContain('<strong>RESULTS Act</strong>');
    expect(m.summary?.versions.map((v) => [v.date, v.label, v.current])).toEqual([
      ['Jan 14, 2026', 'Passed House', true],
      ['Sep 10, 2025', 'Introduced in House', false],
    ]);
    expect(m.summaryEmpty).toBeNull();
  });

  it('groups actions by day, newest first, and keeps the mart count', () => {
    const m = buildBillPage(BILL);
    expect(m.actions.map((g) => [g.date, g.items.length])).toEqual([
      ['Thursday, Sep 11, 2025', 1],
      ['Wednesday, Sep 10, 2025', 2],
    ]);
    expect(m.actions[0].items[0].meta).toBe('IntroReferral · House floor actions');
    expect(m.actionCount).toBe(3);
  });

  it('cosponsor chips come from the mart counts, and tracked members get a link', () => {
    const m = buildBillPage(BILL);
    expect(m.cosponsors.total).toBe(3);
    // pluralised against the mart count: one Democrat, two Republicans
    expect(m.cosponsors.chips).toEqual([
      { label: '1 Democrat', count: 1 },
      { label: '2 Republicans', count: 2 },
    ]);
    expect(m.cosponsors.meta).toBe('3 recorded · earliest first');
    expect(m.actionsMeta).toBe('3 recorded · most recent first');
    expect(m.rollCallsMeta).toBe('1 recorded · most recent first');
    expect(m.cosponsors.withdrawn).toBe(1);
    expect(m.cosponsors.rows[0]).toEqual({
      name: 'Bryan Steil',
      meta: 'R-WI-1',
      date: 'Sep 4, 2026',
      withdrawn: false,
      href: '/members/S001213',
    });
    expect(m.cosponsors.rows[2].withdrawn).toBe(true);
    expect(m.cosponsors.rows[2].href).toBeNull();
  });

  it('roll calls carry the tally and the tracked positions', () => {
    const m = buildBillPage(BILL);
    expect(m.rollCalls[0].heading).toBe('House roll call 295 · Jan 14, 2026');
    expect(m.rollCalls[0].tally).toBe('237–169');
    expect(m.rollCalls[0].detail).toBe('Passed · 1 present · 26 not voting');
    expect(m.rollCalls[0].positions.map((p) => `${p.name} ${p.position}`)).toEqual([
      'Bryan Steil Yea',
      'Hakeem Jeffries Nay',
    ]);
  });

  it('vote journey: stage labels, statuses, tallies and bar widths are the mart rows, formatted', () => {
    const law = buildJourney(LAW_JOURNEY);
    // S. 5 started in the Senate, so the Senate vote comes first
    expect(law.map((s) => [s.label, s.statusLabel, s.tone])).toEqual([
      ['Introduced', 'Introduced', 'done'],
      ['Senate vote', 'Passed', 'done'],
      ['House vote', 'Passed', 'done'],
      ['To President', 'Presented', 'done'],
      ['Became law', 'Enacted', 'done'],
    ]);
    const senate = law[1].vote!;
    expect(senate.tally).toBe('64–35');
    expect(senate.href).toBe('#roll-call-senate-1-7');
    expect(senate.linkLabel).toBe('Senate roll call 7');
    // one bar for the whole vote: Yea by party, then Nay by party, then not voting (none here).
    // R leads the Yea half (52 to 12) so it gets full red and D a lighter tint; D leads the Nay
    // half (33 to 0 Republican, since only Independents crossed) so D is full blue there and the
    // 2 Independent Nay votes read in the same neutral gray as "not voting" -- not a third hue.
    expect(senate.bar.segments.map((s) => [s.direction, s.party, s.count, s.pct, s.color])).toEqual([
      ['Yea', 'R', 52, (52 / 99) * 100, '#B9302F'],
      ['Yea', 'D', 12, (12 / 99) * 100, '#A7B9D9'],
      ['Nay', 'D', 33, (33 / 99) * 100, '#1F4E9C'],
      ['Nay', null, 2, (2 / 99) * 100, '#A6A39C'],
    ]);
    expect(law[4].date).toBe('Jan 29, 2025');
    expect(law[4].detail).toBe('Became Public Law No: 119-1.');

    const passedHouse = buildJourney(PASSED_HOUSE_JOURNEY);
    expect(passedHouse.map((s) => s.statusLabel)).toEqual([
      'Introduced',
      'Passed',
      'Pending',
      'Pending',
      'Pending',
    ]);
    expect(passedHouse[1].vote?.majority).toBe('2/3 required');
    expect(passedHouse[2].tone).toBe('pending');
    expect(passedHouse[2].vote).toBeNull();

    const failed = buildJourney(FAILED_JOURNEY);
    expect(failed.map((s) => [s.label, s.statusLabel, s.tone, s.endsJourney])).toEqual([
      ['Introduced', 'Introduced', 'done', false],
      ['Senate vote', 'Failed', 'failed', true],
    ]);
    expect(failed[1].vote?.bar.segments.map((s) => [s.direction, s.party, s.count, s.color])).toEqual([
      ['Yea', 'D', 45, '#1F4E9C'],
      ['Yea', null, 2, '#A6A39C'],
      ['Nay', 'R', 53, '#B9302F'],
    ]);

    // a chamber that acted without a roll call reads neutrally and carries no bar
    const noRollCall = buildJourney([
      { ...LAW_JOURNEY[2], status: 'no_roll_call', status_label: 'No roll call vote', date: null, vote: null },
    ]);
    expect(noRollCall[0]).toMatchObject({ statusLabel: 'No roll call vote', tone: 'neutral', vote: null });
  });

  it('explains an absent summary rather than showing an empty box', () => {
    const bill = buildBillPage(BILL_NO_SUMMARY);
    expect(bill.summary).toBeNull();
    expect(bill.summaryEmpty).toMatch(/has not published a summary/);
    expect(bill.sponsorHref).toBe('/members/S001213');

    const amendment = buildBillPage(AMENDMENT);
    expect(amendment.kindLabel).toBe('Amendment');
    expect(amendment.summaryEmpty).toBe(
      'The Congressional Research Service does not summarise amendments.',
    );
    expect(amendment.amends).toEqual({ label: 'HR 21', href: '/bills/119/hr/21' });
  });
});

describe('bill page: given this API row, this text renders', () => {
  it('header, summary, actions, cosponsors, roll calls, and the Congress.gov link', () => {
    render(page());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('RESULTS Act');
    // once in the breadcrumb, once as the header label
    expect(screen.getAllByText('H.R. 5269')).toHaveLength(2);
    expect(screen.getByText('119th Congress')).toBeInTheDocument();
    expect(screen.getByText('Government Operations and Politics')).toBeInTheDocument();
    expect(screen.getByText(/Introduced Sep 10, 2025/)).toBeInTheDocument();
    expect(screen.getByText(/Latest action Sep 11, 2025/)).toBeInTheDocument();

    // the title leads: it is the h1 and the larger type; the number is a smaller identifier
    const heading = screen.getByRole('heading', { level: 1 });
    const header = heading.parentElement!; // the chip row and the title, not the breadcrumb
    const label = within(header).getByText('H.R. 5269');
    expect(heading.className).toContain('text-[22px]');
    expect(label.className).toContain('text-card');
    expect(heading.className).not.toContain('text-card');
    // the policy area says what it is rather than standing alone as a bare keyword
    expect(screen.getByText('Policy area')).toBeInTheDocument();
    expect(screen.getByText('Policy area').parentElement).toHaveTextContent(
      'Policy area Government Operations and Politics',
    );

    const summary = screen.getByLabelText('Summary');
    expect(within(summary).getByText('As of Jan 14, 2026 · Passed House')).toBeInTheDocument();
    expect(within(summary).getByText('This bill requires agencies to publish outcomes.')).toBeInTheDocument();
    expect(within(summary).getByText(/Earlier versions \(2 in all\)/)).toBeInTheDocument();

    const cosponsors = screen.getByLabelText('Cosponsors');
    expect(within(cosponsors).getByText('1 Democrat')).toBeInTheDocument();
    expect(within(cosponsors).getByText('2 Republicans')).toBeInTheDocument();
    // every card corner reads the same way as the action history
    expect(within(cosponsors).getByText('3 recorded · earliest first')).toBeInTheDocument();
    expect(within(cosponsors).getByText('1 withdrawn')).toBeInTheDocument();
    expect(within(cosponsors).getByRole('link', { name: 'Bryan Steil' })).toHaveAttribute(
      'href',
      '/members/S001213',
    );

    const calls = screen.getByLabelText('Roll calls');
    expect(within(calls).getByText('House roll call 295 · Jan 14, 2026')).toBeInTheDocument();
    expect(within(calls).getByText('237–169')).toBeInTheDocument();
    expect(within(calls).getByText(/Bryan Steil:/)).toHaveTextContent('Bryan Steil: Yea');

    const actions = screen.getByLabelText('Action history');
    expect(within(actions).getByText('3 recorded · most recent first')).toBeInTheDocument();
    expect(within(calls).getByText('1 recorded · most recent first')).toBeInTheDocument();
    expect(within(actions).getByText('Wednesday, Sep 10, 2025')).toBeInTheDocument();

    // two source links: the bill on Congress.gov in the header, the roll call in its card
    expect(screen.getByTitle('View this bill on Congress.gov')).toHaveAttribute(
      'href',
      'https://www.congress.gov/bill/119th-congress/house-bill/5269',
    );
    expect(within(calls).getByTitle('View the roll call record')).toHaveAttribute(
      'href',
      'https://clerk.house.gov/evs/2026/roll295.xml',
    );
  });

  it('vote journey: every stage renders in the chamber-of-origin order, with tally, link and party bars', () => {
    render(page({ ...BILL, journey: LAW_JOURNEY }));
    const journey = screen.getByLabelText('Vote journey');
    const stages = within(journey).getAllByRole('listitem');
    expect(stages.map((li) => li.getAttribute('data-stage'))).toEqual([
      'introduced',
      'senate_vote',
      'house_vote',
      'to_president',
      'became_law',
    ]);
    // the compact stepper carries the outcome and tally for every stage
    expect(within(stages[1]).getByText('64–35')).toBeInTheDocument();
    expect(within(stages[2]).getByText('263–156')).toBeInTheDocument();
    expect(within(stages[4]).getByText('Enacted')).toBeInTheDocument();
    expect(within(stages[4]).getByText(/Became Public Law No: 119-1\./)).toBeInTheDocument();

    // the party bar and the roll-call link live in the dedicated vote card for each chamber, one
    // bar for the whole vote rather than a bar per direction
    const senateCard = screen.getByLabelText('Senate vote');
    expect(within(senateCard).getByRole('link', { name: /Senate roll call 7/ })).toHaveAttribute(
      'href',
      '#roll-call-senate-1-7',
    );
    expect(
      within(senateCard).getByRole('img', {
        name: 'Yea · R 52, Yea · D 12, Nay · D 33, Nay · Other 2',
      }),
    ).toBeInTheDocument();

    const houseCard = screen.getByLabelText('House vote');
    expect(within(houseCard).getByRole('link', { name: /House roll call 23/ })).toHaveAttribute(
      'href',
      '#roll-call-house-1-23',
    );
  });

  it('vote journey: stages with no vote yet render as pending rather than being hidden', () => {
    render(page({ ...BILL, journey: PASSED_HOUSE_JOURNEY }));
    const journey = screen.getByLabelText('Vote journey');
    expect(within(journey).getAllByRole('listitem')).toHaveLength(5);
    expect(within(journey).getAllByText('Pending')).toHaveLength(3);
    expect(within(journey).getByText('407–0')).toBeInTheDocument();
    const houseCard = screen.getByLabelText('House vote');
    expect(within(houseCard).getByText('2/3 required')).toBeInTheDocument();
    // only the chamber that actually held a recorded vote gets a card
    expect(screen.queryByLabelText('Senate vote')).not.toBeInTheDocument();
  });

  it('vote journey: a failed passage vote is the last stage drawn', () => {
    render(page({ ...BILL, journey: FAILED_JOURNEY }));
    const journey = screen.getByLabelText('Vote journey');
    expect(within(journey).getAllByRole('listitem')).toHaveLength(2);
    expect(within(journey).getByText('Failed')).toBeInTheDocument();
    expect(within(journey).getByText('47–53')).toBeInTheDocument();
    expect(within(journey).getByText('Nothing is recorded after this vote.')).toBeInTheDocument();
    // no greyed-out future stages
    expect(within(journey).queryByText('Pending')).not.toBeInTheDocument();
    expect(within(journey).queryByText('House vote')).not.toBeInTheDocument();
    expect(within(journey).queryByText('Became law')).not.toBeInTheDocument();
  });

  it('roll call rows carry the anchors the journey links to; an amendment has no journey', () => {
    render(page());
    expect(document.getElementById('roll-call-house-2-295')).toHaveTextContent(
      'House roll call 295 · Jan 14, 2026',
    );
    expect(screen.getByLabelText('Vote journey')).toBeInTheDocument();
  });

  it('an amendment renders no vote journey', () => {
    render(page(AMENDMENT));
    expect(screen.queryByLabelText('Vote journey')).not.toBeInTheDocument();
  });

  it('renders the empty states instead of blank sections', () => {
    render(page(BILL_NO_SUMMARY));
    expect(screen.getByText(/has not published a summary of this bill/)).toBeInTheDocument();
    expect(screen.getByText('No member has cosponsored this measure.')).toBeInTheDocument();
    expect(screen.getByText('No recorded roll call has named this measure.')).toBeInTheDocument();
  });

  it('the summary renders as markup, not as escaped tag text', () => {
    render(page());
    const strong = within(screen.getByLabelText('Summary')).getByText('RESULTS Act');
    expect(strong.tagName).toBe('STRONG');
    expect(screen.queryByText(/<strong>/)).not.toBeInTheDocument();
  });

  it('a long cosponsor list collapses and expands', () => {
    const many = {
      ...BILL,
      cosponsors: { total: 20, democratic: 20, republican: 0, other: 0, withdrawn: 0 },
      cosponsor_list: Array.from({ length: 20 }, (_, i) => ({
        ...BILL.cosponsor_list[0],
        bioguide_id: `X${i}`,
        name: `Member ${i}`,
        is_tracked_member: false,
      })),
    };
    render(page(many));
    const cosponsors = screen.getByLabelText('Cosponsors');
    expect(within(cosponsors).queryByText('Member 15')).not.toBeInTheDocument();
    fireEvent.click(within(cosponsors).getByRole('button', { name: 'Show all 20' }));
    expect(within(cosponsors).getByText('Member 15')).toBeInTheDocument();
  });

  it('breadcrumb walks Members, the sponsor, then the bill', () => {
    render(
      <BillPage
        bill={buildBillPage(BILL_NO_SUMMARY)}
        trail={[
          { label: 'Members', href: '/members' },
          { label: 'Bryan Steil', href: '/members/S001213' },
        ]}
        lastUpdated={null}
      />,
    );
    const crumbs = screen.getAllByRole('navigation')[1];
    expect(within(crumbs).getByRole('link', { name: 'Members' })).toHaveAttribute(
      'href',
      '/members',
    );
    expect(within(crumbs).getByRole('link', { name: 'Bryan Steil' })).toHaveAttribute(
      'href',
      '/members/S001213',
    );
    expect(crumbs).toHaveTextContent('H.R. 4735');
  });
});
