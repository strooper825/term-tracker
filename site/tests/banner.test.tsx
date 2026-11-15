import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BANNER_KEY, SiteBanner } from '@/components/SiteBanner';
import { bannerExpired as expired, type Banner } from '@/lib/banner';

const BANNER: Banner = { message: 'The 2028 maps are live.', linkText: 'See them', linkUrl: '/elections/2028/president', until: '', quiet: false };

afterEach(() => window.localStorage.clear());

describe('SiteBanner', () => {
  it('shows the message and its link', () => {
    render(<SiteBanner banner={BANNER} />);
    const notice = screen.getByRole('region', { name: 'Site notice' });
    expect(notice).toHaveTextContent('The 2028 maps are live.');
    expect(screen.getByRole('link', { name: 'See them' })).toHaveAttribute('href', '/elections/2028/president');
    expect(screen.getByRole('link', { name: 'See them' })).not.toHaveAttribute('target');
  });

  it('an outside link opens in a new tab and says so', () => {
    render(<SiteBanner banner={{ ...BANNER, linkUrl: 'https://example.org' }} />);
    const link = screen.getByRole('link', { name: /See them/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveTextContent('(opens in a new tab)');
  });

  it('a dismissed message stays dismissed, and a new message shows again', () => {
    const { unmount } = render(<SiteBanner banner={BANNER} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss the notice' }));
    expect(screen.queryByRole('region', { name: 'Site notice' })).toBeNull();
    expect(window.localStorage.getItem(BANNER_KEY)).toBe(BANNER.message);
    unmount();

    const again = render(<SiteBanner banner={BANNER} />);
    expect(screen.queryByRole('region', { name: 'Site notice' })).toBeNull();
    again.unmount();

    render(<SiteBanner banner={{ ...BANNER, message: 'Something new.' }} />);
    expect(screen.getByRole('region', { name: 'Site notice' })).toHaveTextContent('Something new.');
  });

  it('takes itself down after its last day', () => {
    expect(expired('', new Date(2026, 10, 15))).toBe(false);
    expect(expired('2026-11-15', new Date(2026, 10, 15))).toBe(false);
    expect(expired('2026-11-15', new Date(2026, 10, 16))).toBe(true);
    render(<SiteBanner banner={{ ...BANNER, until: '2020-01-01' }} />);
    expect(screen.queryByRole('region', { name: 'Site notice' })).toBeNull();
  });
});
