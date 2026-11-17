import type { Metadata } from 'next';
import { StatesOverview } from '@/components/StatesOverview';
import { api } from '@/lib/api';
import { lastUpdated } from '@/lib/model';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'States · Term',
  description: 'Who controls each state government: governors, legislatures and party control.',
};

/* Route: /states, the national map of state government control (ADR 0035). */
export default async function StatesPage() {
  const [data, freshness] = await Promise.all([api.states(), api.freshness()]);
  return <StatesOverview data={data} lastUpdated={lastUpdated(freshness)} />;
}
