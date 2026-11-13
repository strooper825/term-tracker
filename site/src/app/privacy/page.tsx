import type { Metadata } from 'next';
import { Prose, ReadingPage } from '@/components/ContentBlocks';
import { PageShell } from '@/components/SiteChrome';
import { loadPage } from '@/lib/content';

export const dynamic = 'force-static';

const page = loadPage('privacy');

export const metadata: Metadata = {
  title: `${page.title} · Term Tracker`,
  description: page.description || undefined,
};

/* Route: /privacy, written in site/content/pages/privacy.md. */
export default function Page() {
  return (
    <PageShell active="About">
      <ReadingPage title={page.title}>
        <Prose html={page.html} />
      </ReadingPage>
    </PageShell>
  );
}
