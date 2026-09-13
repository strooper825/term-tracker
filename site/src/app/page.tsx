import { MembersIndex } from '@/components/MembersIndex';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { indexPageProps } from '@/lib/pages';

export const dynamic = 'force-static';

/* Route: / (also served at /members) */
export default async function IndexPage() {
  const { rows, congressLabel, lastUpdated } = await indexPageProps();
  return (
    <div className="min-h-screen bg-canvas flex justify-center">
      <div className="w-full max-w-[1280px] bg-sheet border-x border-rule">
        <SiteHeader active="Members" />
        <MembersIndex members={rows} congressLabel={congressLabel} />
        <SiteFooter lastUpdated={lastUpdated} />
      </div>
    </div>
  );
}
