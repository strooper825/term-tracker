import type { Metadata } from 'next';
import { Prose, ReadingPage, formatArticleDate } from '@/components/ContentBlocks';
import { PageShell } from '@/components/SiteFrame';
import { loadArticles } from '@/lib/content';

export const dynamic = 'force-static';
export const dynamicParams = false;

/* A static export refuses a dynamic route with no page at all, and there are no articles until
   the first is written: one placeholder route keeps the build going (as for bills, ADR 0021). */
const NO_ARTICLES = '_none';

export function generateStaticParams() {
  const articles = loadArticles();
  return articles.length ? articles.map((a) => ({ slug: a.slug })) : [{ slug: NO_ARTICLES }];
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const article = loadArticles().find((a) => a.slug === slug);
  if (!article) return { title: 'Articles · Term Tracker' };
  return { title: `${article.title} · Term Tracker`, description: article.summary || undefined };
}

export default async function ArticlePage({ params }: { params: Params }) {
  const { slug } = await params;
  const article = loadArticles().find((a) => a.slug === slug);
  return (
    <PageShell active="Articles">
      {article ? (
        <ReadingPage
          kicker={article.category || 'Article'}
          title={article.title}
          lede={
            <>
              {article.summary && <p className="m-0 mb-2">{article.summary}</p>}
              <p className="m-0 text-meta text-ink2">
                {formatArticleDate(article.date)}
                {article.author ? ` · ${article.author}` : ''}
              </p>
            </>
          }
        >
          {article.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={article.image} alt="" className="w-full rounded-card bg-lockBg" />
          )}
          <Prose html={article.html} />
          <p className="m-0 pt-4 border-t border-rule">
            <a href="/articles" className="text-[15px] font-semibold text-navy hover:text-ink">
              ← All articles
            </a>
          </p>
        </ReadingPage>
      ) : (
        <ReadingPage title="No articles yet">
          <a href="/articles" className="text-[15px] font-semibold text-navy hover:text-ink">
            ← Articles
          </a>
        </ReadingPage>
      )}
    </PageShell>
  );
}
