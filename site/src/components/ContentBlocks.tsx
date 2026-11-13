// Pieces for the pages built from site/content: article cards, a page of prose, and the date
// line. Server components; the Markdown is the site owner's own and rendered at build time.
import type { Article } from '@/lib/content';

export function formatArticleDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function ArticleCard({ article }: { article: Article }) {
  return (
    <a
      href={`/articles/${article.slug}`}
      className="flex flex-col bg-card border border-rule rounded-card overflow-hidden text-ink hover:border-lockInk"
    >
      {article.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={article.image} alt="" loading="lazy" className="w-full h-[160px] object-cover bg-lockBg" />
      ) : (
        <span aria-hidden className="block h-1.5 bg-navy" />
      )}
      <span className="px-[18px] pt-4 pb-5 flex flex-col gap-2">
        {article.category && (
          <span className="text-label font-semibold uppercase text-navy">{article.category}</span>
        )}
        <span className="text-[18px] font-semibold leading-snug">{article.title}</span>
        {article.summary && <span className="text-[14px] leading-normal text-ink2">{article.summary}</span>}
        <span className="text-meta text-ink2">
          {formatArticleDate(article.date)}
          {article.author ? ` · ${article.author}` : ''}
        </span>
      </span>
    </a>
  );
}

export function ArticleGrid({ articles }: { articles: Article[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {articles.map((a) => (
        <ArticleCard key={a.slug} article={a} />
      ))}
    </div>
  );
}

/** Rendered Markdown with the site's type: headings, paragraphs, lists, links. */
export function Prose({ html }: { html: string }) {
  return (
    <div
      className="prose-tt text-[16px] leading-relaxed text-ink"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** A centered column of reading width under a page title. */
export function ReadingPage({
  kicker,
  title,
  lede,
  children,
}: {
  kicker?: string;
  title: string;
  lede?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="px-6 md:px-7 py-10 md:py-14 flex justify-center">
      <article className="w-full max-w-[720px] flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          {kicker && <p className="m-0 text-label font-semibold uppercase text-navy">{kicker}</p>}
          <h1 className="m-0 text-[32px] md:text-hero font-bold text-ink">{title}</h1>
          {lede && <div className="text-[17px] leading-normal text-ink2">{lede}</div>}
        </header>
        {children}
      </article>
    </main>
  );
}
