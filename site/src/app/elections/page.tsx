import type { Metadata } from 'next';
import { ReadingPage } from '@/components/ContentBlocks';
import { PageShell } from '@/components/SiteFrame';
import { OFFICE_LABEL } from '@/lib/elections';
import { listElectionMaps, mapHref } from '@/lib/electionsContent';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Elections · Term',
  description: 'What-if maps for the presidential, Senate and Governor elections.',
};

/* Route: /elections. The section has no front page (ADR 0024): vercel.json redirects this
   address to the default map. This list is what is left where no redirect runs (a local build). */
export default function ElectionsPage() {
  return (
    <PageShell active="Elections">
      <ReadingPage title="Elections">
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {listElectionMaps().map((m) => (
            <li key={mapHref(m)}>
              <a href={mapHref(m)} className="text-[17px] font-semibold text-navy hover:text-ink">
                {m.cycle} {OFFICE_LABEL[m.office]} →
              </a>
            </li>
          ))}
        </ul>
      </ReadingPage>
    </PageShell>
  );
}
