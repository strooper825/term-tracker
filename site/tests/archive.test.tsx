import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArchiveNotice } from '@/components/SiteChrome';
import { archiveBanner, archiveLinks } from '@/lib/archive';

describe('archive wiring (ADR 0021)', () => {
  it('is the live site when nothing is set', () => {
    expect(archiveBanner({})).toBeNull();
    expect(archiveLinks({})).toEqual([]);
  });

  it('labels an archive build with its Congress, its date and the way back', () => {
    const banner = archiveBanner({
      NEXT_PUBLIC_ARCHIVE_OF: '119',
      NEXT_PUBLIC_ARCHIVE_AS_OF: '2027-01-05',
      NEXT_PUBLIC_LIVE_URL: 'https://example.org',
    });
    expect(banner).toEqual({
      congressLabel: '119th Congress',
      asOf: 'Jan 5, 2027',
      liveUrl: 'https://example.org',
    });
    render(<ArchiveNotice banner={banner!} />);
    expect(screen.getByRole('note').textContent).toContain(
      'This is the 119th Congress as it stood on Jan 5, 2027. It is no longer updated.',
    );
    expect(screen.getByRole('link', { name: 'Go to the current Congress' })).toHaveAttribute(
      'href',
      'https://example.org',
    );
  });

  it('still says it is an archive when the date and the live address are missing', () => {
    const banner = archiveBanner({ NEXT_PUBLIC_ARCHIVE_OF: '119' });
    render(<ArchiveNotice banner={banner!} />);
    expect(screen.getByRole('note').textContent).toContain(
      'This is the 119th Congress. It is no longer updated.',
    );
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('links the live site to each archive', () => {
    expect(
      archiveLinks({ NEXT_PUBLIC_ARCHIVES: '119=https://a.example.org, 118=https://b.example.org/?x=1' }),
    ).toEqual([
      { label: '119th Congress archive', href: 'https://a.example.org' },
      { label: '118th Congress archive', href: 'https://b.example.org/?x=1' },
    ]);
  });

  it('fails the build on a setting it cannot read rather than mislabelling the site', () => {
    expect(() => archiveBanner({ NEXT_PUBLIC_ARCHIVE_OF: 'true' })).toThrow(/Congress number/);
    expect(() =>
      archiveBanner({ NEXT_PUBLIC_ARCHIVE_OF: '119', NEXT_PUBLIC_ARCHIVE_AS_OF: 'Jan 5' }),
    ).toThrow(/YYYY-MM-DD/);
    expect(() =>
      archiveBanner({ NEXT_PUBLIC_ARCHIVE_OF: '119', NEXT_PUBLIC_LIVE_URL: 'example.org' }),
    ).toThrow(/URL/);
    expect(() => archiveLinks({ NEXT_PUBLIC_ARCHIVES: 'https://a.example.org' })).toThrow(/entry/);
  });
});
