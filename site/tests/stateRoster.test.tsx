import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StateRoster } from '@/components/StateRoster';
import {
  committeeLine,
  districtName,
  initials,
  legislatorAnchor,
  rosterPath,
  socialLinks,
  termYears,
  titlePlural,
  type StateLegislatorProfile,
  type StateRosterResponse,
} from '@/lib/states';

// Invented legislators in the shape of GET /api/v1/states/{abbr}/legislators (ADR 0035).
function person(over: Partial<StateLegislatorProfile>): StateLegislatorProfile {
  return {
    person_id: 'ocd-person/x',
    district: '1',
    district_note: null,
    name: 'Invented Person',
    family_name: 'Person',
    party: 'D',
    party_group: 'D',
    party_label: 'Democratic',
    party_basis: 'party',
    image_url: null,
    email: null,
    website_url: null,
    capitol_office: null,
    district_office: null,
    social: { twitter: null, facebook: null, instagram: null, youtube: null },
    terms: [],
    committees: [],
    ...over,
  };
}

const ZED = person({
  person_id: 'ocd-person/zed',
  district: '2',
  name: 'Zed Adams',
  family_name: 'Adams',
  party: 'R',
  party_group: 'R',
  party_label: 'Republican',
  email: 'zed@leg.example',
  website_url: 'https://leg.example/zed',
  capitol_office: { address: '1 Capitol Sq., Example', phone: '(555) 555-0100' },
  district_office: { address: null, phone: '555-555-0101' },
  social: { twitter: 'zedadams', facebook: null, instagram: null, youtube: 'Some Name With Spaces' },
  terms: [
    { chamber: 'upper', chamber_name: 'Senate', district: '2', start_date: '2023-01-04', end_date: null },
    { chamber: 'lower', chamber_name: 'House', district: '17', start_date: '2019-01-07', end_date: '2023-01-03' },
  ],
  committees: [
    { name: 'Finance', chamber: 'upper', role: 'Chair' },
    { name: 'Audit', chamber: 'legislature', role: null },
  ],
});

const AMY = person({
  person_id: 'ocd-person/amy',
  district: '10',
  name: 'Amy Zimmer',
  family_name: 'Zimmer',
  terms: [{ chamber: 'upper', chamber_name: 'Senate', district: '10', start_date: null, end_date: null }],
  committees: [{ name: 'Education', chamber: 'upper', role: null }],
});

const ROSTER: StateRosterResponse = {
  as_of: '2026-11-17',
  state: 'XX',
  name: 'Example',
  legislature_name: 'Example Legislature',
  chambers: [
    { chamber: 'upper', slug: 'senate', name: 'Senate', title: 'Senator', seats: 3, vacant: 1, legislators: [ZED, AMY] },
    { chamber: 'lower', slug: 'assembly', name: 'Assembly', title: 'Assembly Member', seats: 2, vacant: 0, legislators: [] },
  ],
  generated_at: '2026-11-17T00:00:00Z',
  sources: [{ source: 'openstates_people', source_url: 'x', fetched_at: '2026-11-17T03:00:00Z' }],
};

describe('roster helpers', () => {
  it('builds stable anchors and paths from district and name', () => {
    expect(legislatorAnchor('Berkshire, Hampden and Franklin', 'José Núñez')).toBe('berkshire-hampden-and-franklin-jose-nunez');
    expect(rosterPath('WI', 'assembly', 'a')).toBe('/states/wi/assembly#a');
  });

  it('words counts, districts, years and committees', () => {
    expect(titlePlural('Senator', 40)).toBe('40 senators');
    expect(titlePlural('Assembly Member', 80)).toBe('80 assembly members');
    expect(titlePlural('Councilmember', 1)).toBe('1 councilmember');
    expect(districtName('7')).toBe('District 7');
    expect(districtName('10A')).toBe('District 10A');
    expect(districtName('2nd Berkshire')).toBe('2nd Berkshire');
    expect(termYears({ start_date: '2019-01-07', end_date: '2023-01-03' })).toBe('2019–2023');
    expect(termYears({ start_date: '2023-01-04', end_date: null })).toBe('2023–present');
    expect(termYears({ start_date: null, end_date: null })).toBeNull();
    expect(committeeLine({ name: 'Finance', chamber: 'upper', role: 'Chair' }, true)).toBe('Finance (chair)');
    expect(committeeLine({ name: 'Audit', chamber: 'legislature', role: null }, true)).toBe('Audit (joint)');
    expect(committeeLine({ name: 'Audit', chamber: 'legislature', role: null }, false)).toBe('Audit');
    expect(committeeLine({ name: 'Rules', chamber: 'upper', role: 'Ranking Democratic Member' }, true)).toBe(
      'Rules (ranking Democratic member)',
    );
    expect(initials('Paul W. Mark')).toBe('PM');
  });

  it('keeps only usable social accounts', () => {
    const links = socialLinks({ twitter: '@a_b|other', facebook: 'Page Name', instagram: 'ig.name', youtube: 'UCeLj0zTgt3jyDIYL3IAzLpQ' });
    expect(links.map((l) => l.href)).toEqual([
      'https://x.com/a_b',
      'https://www.instagram.com/ig.name',
      'https://www.youtube.com/channel/UCeLj0zTgt3jyDIYL3IAzLpQ',
    ]);
    expect(socialLinks({ twitter: null, facebook: null, instagram: null, youtube: 'uc6c_hcnxxhg2fxqmz2gjx8w' })).toEqual([]);
  });
});

describe('StateRoster', () => {
  const renderRoster = () =>
    render(<StateRoster roster={ROSTER} chamber={ROSTER.chambers[0]} sourceDate="2026-11-17" lastUpdated={null} />);

  it('shows each legislator with contact details, service and committees', () => {
    renderRoster();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Example Senate');
    const card = document.getElementById('2-zed-adams')!;
    expect(within(card).getByRole('link', { name: 'zed@leg.example' })).toHaveAttribute('href', 'mailto:zed@leg.example');
    expect(within(card).getByRole('link', { name: '(555) 555-0100' })).toHaveAttribute('href', 'tel:5555550100');
    expect(card).toHaveTextContent('Senate, District 2 · 2023–present');
    expect(card).toHaveTextContent('House, District 17 · 2019–2023');
    expect(card).toHaveTextContent('Finance (chair)');
    expect(card).toHaveTextContent('Audit (joint)');
    expect(within(card).getByRole('link', { name: /^X/ })).toHaveAttribute('href', 'https://x.com/zedadams');
    expect(within(card).queryByRole('link', { name: /YouTube/ })).toBeNull();
    expect(card).toHaveTextContent('ZA'); // no photo: initials
    const amy = document.getElementById('10-amy-zimmer')!;
    expect(amy).toHaveTextContent('Senate, District 10 · dates not recorded');
    // the other chamber is one click away
    expect(screen.getByRole('link', { name: 'Assembly' })).toHaveAttribute('href', '/states/xx/assembly');
    expect(screen.getByRole('link', { name: 'Senate' })).toHaveAttribute('aria-current', 'page');
  });

  it('finds by name or committee and sorts by last name', () => {
    renderRoster();
    const zed = document.getElementById('2-zed-adams')!;
    const amy = document.getElementById('10-amy-zimmer')!;
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'education' } });
    expect(zed.style.display).toBe('none');
    expect(amy.style.display).toBe('');
    expect(screen.getByText('1 of 2 senators')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'name' } });
    expect(Number(zed.style.order)).toBeLessThan(Number(amy.style.order));
  });
});
