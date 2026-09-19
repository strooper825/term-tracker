import { CongressOverview } from '@/components/CongressOverview';
import { congressPageProps } from '@/lib/pages';

export const dynamic = 'force-static';

/* Route: /congress, the one page about the whole Congress rather than a single member. */
export default async function CongressPage() {
  const { model, lastUpdated } = await congressPageProps();
  return <CongressOverview model={model} lastUpdated={lastUpdated} />;
}
