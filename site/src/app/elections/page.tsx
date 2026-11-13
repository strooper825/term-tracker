import type { Metadata } from 'next';
import { ReadingPage } from '@/components/ContentBlocks';
import { PageShell } from '@/components/SiteFrame';
import { ELECTION_RACES } from '@/lib/sections';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Elections · Term Tracker',
  description: 'Presidential, Senate, House and governor races: coming to Term Tracker.',
};

/* Route: /elections, the section's front page; every race type is a placeholder for now (ADR 0022). */
export default function ElectionsPage() {
  return (
    <PageShell active="Elections">
      <ReadingPage kicker="Coming soon" title="Elections">
        <p className="m-0 text-[16px] leading-relaxed text-ink">
          Races, candidates and results, built from the same public records as the rest of the site.
          This section is being built. Until then, every member&apos;s dashboard shows when their seat
          is next on the ballot.
        </p>
        <ul className="m-0 p-0 list-none grid gap-3 sm:grid-cols-2">
          {ELECTION_RACES.map((race) => (
            <li key={race.slug}>
              <a
                href={`/elections/${race.slug}`}
                className="h-full flex flex-col gap-1.5 p-4 bg-card border border-rule rounded-card hover:border-ink3"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-[17px] font-semibold text-ink">{race.label}</span>
                  <span className="text-micro font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-chip bg-lockBg text-ink2">
                    Soon
                  </span>
                </span>
                <span className="text-[14px] leading-normal text-ink2">{race.blurb}</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="m-0">
          <a href="/members" className="text-[15px] font-semibold text-navy hover:text-ink">
            Browse members →
          </a>
        </p>
      </ReadingPage>
    </PageShell>
  );
}
