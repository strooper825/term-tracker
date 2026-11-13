import type { Metadata } from 'next';
import { MembersIndex } from '@/components/MembersIndex';
import { PageShell } from '@/components/SiteFrame';
import { indexPageProps } from '@/lib/pages';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Members · Term Tracker',
  description: 'Term dashboards for the members of Congress Term Tracker follows.',
};

/* Route: /members, the tracked members' index (it was also the homepage until ADR 0022). */
export default async function MembersPage() {
  const { rows, congressLabel, lastUpdated } = await indexPageProps();
  return (
    <PageShell active="Congress" lastUpdated={lastUpdated}>
      <MembersIndex members={rows} congressLabel={congressLabel} />
    </PageShell>
  );
}
