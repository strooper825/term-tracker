import type { Metadata } from 'next';
import { BillBrowser } from '@/components/BillBrowser';
import { PageShell } from '@/components/SiteFrame';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Bills · Term',
  description: 'Browse and search every bill in Congress by how far it got, when it last moved, topic and more.',
};

/* Route: /bills, the browse page (ADR 0025). The list is two static files the browser fetches;
   the filters live in the address, so a filtered view can be linked from an article. */
export default function BillsPage() {
  return (
    <PageShell active="Congress">
      <BillBrowser />
    </PageShell>
  );
}
