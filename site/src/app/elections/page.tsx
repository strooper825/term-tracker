import type { Metadata } from 'next';
import { ReadingPage } from '@/components/ContentBlocks';
import { PageShell } from '@/components/SiteChrome';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Elections · Term Tracker',
  description: 'Races, candidates and results: coming to Term Tracker.',
};

/* Route: /elections, a placeholder until the elections section has data (ADR 0022). */
export default function ElectionsPage() {
  return (
    <PageShell active="Elections">
      <ReadingPage kicker="Coming soon" title="Elections">
        <p className="m-0 text-[16px] leading-relaxed text-ink">
          Races, candidates and results, built from the same public records as the rest of the site.
          This section is being built. Until then, every member&apos;s dashboard shows when their seat
          is next on the ballot.
        </p>
        <p className="m-0">
          <a href="/members" className="text-[15px] font-semibold text-navy hover:text-ink">
            Browse members →
          </a>
        </p>
      </ReadingPage>
    </PageShell>
  );
}
