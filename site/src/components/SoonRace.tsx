// The placeholder for an election race that is announced but not built (ADR 0024).
import { ReadingPage } from './ContentBlocks';
import { PageShell } from './SiteFrame';
import { DEFAULT_CYCLE, SOON_RACES } from '@/lib/sections';

export function soonRace(slug: string) {
  const race = SOON_RACES.find((r) => r.slug === slug)!;
  return {
    metadata: { title: `${race.title} · Term`, description: `${race.blurb} Coming soon.` },
    Page: function SoonRacePage() {
      return (
        <PageShell active="Elections">
          <ReadingPage kicker="Elections · Coming soon" title={race.title}>
            <p className="m-0 text-[16px] leading-relaxed text-ink">{race.blurb}</p>
            <p className="m-0">
              <a href={`/elections/${DEFAULT_CYCLE}/senate`} className="text-[15px] font-semibold text-navy hover:text-ink">
                Try the Senate map →
              </a>
            </p>
          </ReadingPage>
        </PageShell>
      );
    },
  };
}
