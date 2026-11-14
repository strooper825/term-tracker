import type { Metadata } from 'next';
import { Prose, ReadingPage } from '@/components/ContentBlocks';
import { PageShell } from '@/components/SiteFrame';
import { loadPage } from '@/lib/content';

export const dynamic = 'force-static';

const page = loadPage('about');

export const metadata: Metadata = {
  title: `${page.title} · Term`,
  description: page.description || undefined,
};

/* Route: /about, written in site/content/pages/about.md. */
export default function Page() {
  return (
    <PageShell active="About">
      <ReadingPage title={page.title}>
        <Prose html={page.html} />
      </ReadingPage>
    </PageShell>
  );
}
