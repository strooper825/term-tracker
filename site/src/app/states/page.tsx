import type { Metadata } from 'next';
import { ReadingPage } from '@/components/ContentBlocks';
import { PageShell } from '@/components/SiteFrame';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'States · Term Tracker',
  description: 'State governments, governors and legislatures: coming to Term Tracker.',
};

/* Route: /states, a placeholder until the state-government section has data (ADR 0022). */
export default function StatesPage() {
  return (
    <PageShell active="States">
      <ReadingPage kicker="Coming soon" title="States">
        <p className="m-0 text-[16px] leading-relaxed text-ink">
          State governments: governors, legislatures and the people who serve in them, built from the
          same kind of public records as the rest of the site. This section is being built.
        </p>
        <p className="m-0 text-[16px] leading-relaxed text-ink">
          Until then, the map on the homepage shows who represents each state in Congress.
        </p>
        <p className="m-0">
          <a href="/" className="text-[15px] font-semibold text-navy hover:text-ink">
            See the map →
          </a>
        </p>
      </ReadingPage>
    </PageShell>
  );
}
