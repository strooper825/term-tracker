import type { Metadata } from 'next';
import { ArticleGrid } from '@/components/ContentBlocks';
import { PageShell } from '@/components/SiteChrome';
import { loadArticles } from '@/lib/content';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Articles · Term Tracker',
  description: 'Articles and analysis from Term Tracker.',
};

/* Route: /articles, every published article in site/content/articles, newest first. */
export default function ArticlesPage() {
  const articles = loadArticles();
  return (
    <PageShell active="Articles">
      <main className="px-6 md:px-7 py-10 md:py-14 flex flex-col gap-7">
        <header className="flex flex-col gap-2">
          <h1 className="m-0 text-[32px] md:text-hero font-bold text-ink">Articles</h1>
          <p className="m-0 text-[17px] text-ink2">Reporting and analysis built on the records this site tracks.</p>
        </header>
        {articles.length > 0 ? (
          <ArticleGrid articles={articles} />
        ) : (
          <p className="m-0 text-[16px] text-ink2">The first articles are on the way.</p>
        )}
      </main>
    </PageShell>
  );
}
