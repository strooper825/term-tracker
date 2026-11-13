import { ArticleGrid } from '@/components/ContentBlocks';
import { RepresentationMap } from '@/components/RepresentationMap';
import { PageShell } from '@/components/SiteFrame';
import { SiteSearch } from '@/components/SiteSearch';
import { loadArticles, loadSite } from '@/lib/content';
import { homePageProps } from '@/lib/pages';

export const dynamic = 'force-static';

/* Route: /, the front door (ADR 0022): what the site is, search, the map of who holds each seat,
   and the latest articles. The headline and intro are site/content/site.json. */
export default async function HomePage() {
  const site = loadSite();
  const articles = loadArticles().slice(0, 3);
  const { seats, congress } = await homePageProps();
  return (
    <PageShell active="Home" wide>
      <main>
        <section className="max-w-[880px] mx-auto px-4 md:px-6 pt-12 md:pt-[72px] pb-12 md:pb-14 flex flex-col items-center gap-5 text-center">
          <h1 className="m-0 text-[30px] md:text-hero font-bold text-ink">{site.headline}</h1>
          {site.intro && <p className="m-0 max-w-[620px] text-[17px] leading-normal text-ink2">{site.intro}</p>}
          <div className="w-full flex justify-center mt-3">
            <SiteSearch />
          </div>
        </section>

        <div className="max-w-[1180px] mx-auto px-4 md:px-6 pb-16">
          <RepresentationMap seats={seats} congress={congress} />
        </div>

        {articles.length > 0 && (
          <section aria-labelledby="articles-heading" className="max-w-[1080px] mx-auto px-4 md:px-6 pb-[72px] flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="articles-heading" className="m-0 text-[22px] font-bold text-ink">
                Latest articles
              </h2>
              <a href="/articles" className="text-[14px] font-semibold text-navy hover:text-ink">
                All articles →
              </a>
            </div>
            <ArticleGrid articles={articles} />
          </section>
        )}
      </main>
    </PageShell>
  );
}
