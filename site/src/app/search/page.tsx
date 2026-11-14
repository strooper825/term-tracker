import type { Metadata } from 'next';
import { ReadingPage } from '@/components/ContentBlocks';
import { PageShell } from '@/components/SiteFrame';
import { SiteSearch } from '@/components/SiteSearch';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Search · Term',
  description: 'Find a member of Congress or a bill.',
};

/* Route: /search, the header's search button (and /search?bills for the Bills tab). */
export default function SearchPage() {
  return (
    <PageShell active="Home">
      <ReadingPage title="Search" lede="Find a member of Congress by name or state, or a bill by its number or title.">
        <div className="min-h-[360px]">
          <SiteSearch autoFocus />
        </div>
      </ReadingPage>
    </PageShell>
  );
}
