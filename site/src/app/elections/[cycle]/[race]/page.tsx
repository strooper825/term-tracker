import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ElectionMap, type MapLink } from '@/components/ElectionMap';
import { PageShell } from '@/components/SiteFrame';
import { api } from '@/lib/api';
import { OFFICES, OFFICE_LABEL, type Office } from '@/lib/elections';
import { listElectionMaps, loadElectionMap, mapHref } from '@/lib/electionsContent';
import { SOON_RACES } from '@/lib/sections';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return listElectionMaps().map((m) => ({ cycle: String(m.cycle), race: m.office }));
}

type Params = Promise<{ cycle: string; race: string }>;

function find(cycle: string, race: string) {
  return listElectionMaps().find((m) => String(m.cycle) === cycle && m.office === race);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { cycle, race } = await params;
  const ref = find(cycle, race);
  if (!ref) return {};
  const what = ref.office === 'senate' ? 'Senate' : ref.office === 'governor' ? 'Governor' : 'presidential';
  return {
    title: `${ref.cycle} ${what} what-if map · Term`,
    description: `Pick who wins each ${ref.cycle} ${what} race and see where it leaves the count.`,
  };
}

/* Route: /elections/{cycle}/{race}, one what-if map (ADR 0024). The address is permanent: an
   archived cycle keeps it. */
export default async function ElectionMapPage({ params }: { params: Params }) {
  const { cycle, race } = await params;
  const ref = find(cycle, race);
  if (!ref) notFound();
  const all = listElectionMaps();
  const { seats } = await api.seats();
  const map = loadElectionMap(ref, seats);

  const built = new Set(all.filter((m) => m.cycle === ref.cycle).map((m) => m.office));
  const offices: MapLink[] = [
    // an office with no race this cycle (President in a midterm) is left out
    ...OFFICES.filter((office: Office) => built.has(office)).map((office: Office) => ({
      label: OFFICE_LABEL[office],
      href: mapHref({ cycle: ref.cycle, office }),
      active: office === ref.office,
    })),
    ...SOON_RACES.filter((r) => r.slug === 'house').map((r) => ({ label: r.label, href: `/elections/${r.slug}`, soon: true })),
  ];
  const cycles: MapLink[] = [...new Set(all.map((m) => m.cycle))]
    .sort((a, b) => a - b)
    .map((c) => ({
      label: String(c),
      // the same race in that cycle when it has one, else that cycle's first map
      href: mapHref(all.find((m) => m.cycle === c && m.office === ref.office) ?? all.find((m) => m.cycle === c)!),
      active: c === ref.cycle,
    }));

  return (
    <PageShell active="Elections">
      <ElectionMap map={map} offices={offices} cycles={cycles} />
    </PageShell>
  );
}
