import type { Metadata } from 'next';
import { StatePage } from '@/components/StatePage';
import { api } from '@/lib/api';
import { lastUpdated } from '@/lib/model';
import { controlLabel } from '@/lib/states';

export const dynamic = 'force-static';
export const dynamicParams = false;

type Params = { params: Promise<{ state: string }> };

export async function generateStaticParams() {
  const { states } = await api.states();
  return states.map((s) => ({ state: s.state.toLowerCase() }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { state } = await params;
  const detail = await api.state(state);
  return {
    title: `${detail.state.name} · States · Term`,
    description: `${detail.state.name}'s governor and legislature: ${controlLabel(detail.state).toLowerCase()}.`,
  };
}

/* Route: /states/{abbr}, one state's government (ADR 0035). */
export default async function StateRoute({ params }: Params) {
  const { state } = await params;
  const [detail, freshness] = await Promise.all([api.state(state), api.freshness()]);
  return (
    <StatePage
      summary={detail.state}
      legislatureName={detail.legislature_name}
      asOf={detail.as_of}
      sourceDate={detail.sources[0]?.fetched_at.slice(0, 10) ?? null}
      lastUpdated={lastUpdated(freshness)}
    />
  );
}
