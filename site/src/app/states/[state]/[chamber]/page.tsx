import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StateRoster } from '@/components/StateRoster';
import { api } from '@/lib/api';
import { lastUpdated } from '@/lib/model';

export const dynamic = 'force-static';
export const dynamicParams = false;

type Params = { params: Promise<{ state: string; chamber: string }> };

export async function generateStaticParams() {
  const { states } = await api.states();
  return states.flatMap((s) => s.chambers.map((c) => ({ state: s.state.toLowerCase(), chamber: c.slug })));
}

async function load(state: string, slug: string) {
  const roster = await api.stateRoster(state);
  const chamber = roster.chambers.find((c) => c.slug === slug);
  if (!chamber) notFound();
  return { roster, chamber };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { state, chamber: slug } = await params;
  const { roster, chamber } = await load(state, slug);
  const title = chamber.chamber === 'legislature' ? chamber.name : `${roster.name} ${chamber.name}`;
  return {
    title: `${title} · States · Term`,
    description: `Every member of the ${title}: party, district, contact details, service and committees.`,
  };
}

/* Route: /states/{abbr}/{chamber slug}, one chamber's legislators (ADR 0035). */
export default async function StateRosterRoute({ params }: Params) {
  const { state, chamber: slug } = await params;
  const [{ roster, chamber }, freshness] = await Promise.all([load(state, slug), api.freshness()]);
  return (
    <StateRoster
      roster={roster}
      chamber={chamber}
      sourceDate={roster.sources[0]?.fetched_at.slice(0, 10) ?? null}
      lastUpdated={lastUpdated(freshness)}
    />
  );
}
