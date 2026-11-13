import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReadingPage } from '@/components/ContentBlocks';
import { PageShell } from '@/components/SiteFrame';
import { ELECTION_RACES } from '@/lib/sections';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return ELECTION_RACES.map((r) => ({ race: r.slug }));
}

type Params = Promise<{ race: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { race: slug } = await params;
  const race = ELECTION_RACES.find((r) => r.slug === slug);
  return race
    ? { title: `${race.label} elections · Term Tracker`, description: `${race.blurb} Coming soon.` }
    : {};
}

/* Route: /elections/{presidential,senate,house,governor}, placeholders until each has data. */
export default async function ElectionRacePage({ params }: { params: Params }) {
  const { race: slug } = await params;
  const race = ELECTION_RACES.find((r) => r.slug === slug);
  if (!race) notFound();
  return (
    <PageShell active="Elections">
      <ReadingPage kicker="Elections · Coming soon" title={`${race.label} elections`}>
        <p className="m-0 text-[16px] leading-relaxed text-ink">{race.blurb}</p>
        <p className="m-0 text-[16px] leading-relaxed text-ink">
          This page is being built and will fill in from public records as the section comes together.
        </p>
        <p className="m-0">
          <a href="/elections" className="text-[15px] font-semibold text-navy hover:text-ink">
            ← All elections
          </a>
        </p>
      </ReadingPage>
    </PageShell>
  );
}
