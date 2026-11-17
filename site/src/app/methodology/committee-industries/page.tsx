import type { Metadata } from 'next';
import { Prose, ReadingPage } from '@/components/ContentBlocks';
import { PageShell } from '@/components/SiteFrame';
import { api } from '@/lib/api';
import { loadPage } from '@/lib/content';
import { buildCommitteeIndustries } from '@/lib/model';

export const dynamic = 'force-static';

const page = loadPage('committee-industries');

export const metadata: Metadata = {
  title: `${page.title} · Term`,
  description: page.description || undefined,
};

/* Route: /methodology/committee-industries (ADR 0032). The words are
   site/content/pages/committee-industries.md; the list is the committee_industries seed, read
   through the API at build time, so the page shows exactly what the overlap notes rest on. */
export default async function Page() {
  const model = buildCommitteeIndustries(await api.committeeIndustries());
  return (
    <PageShell active="About">
      <ReadingPage title={page.title}>
        <Prose html={page.html} />
        <section aria-labelledby="mapped-title" className="flex flex-col gap-3">
          <h2 id="mapped-title" className="m-0 text-heading font-semibold text-ink">
            Committees and the industries they are taken to oversee
          </h2>
          {model.mapped.map((c) => (
            <div key={c.key} className="border border-rule rounded-card">
              <div className="px-4 pt-3 pb-2 flex flex-col gap-0.5">
                <h3 className="m-0 text-base font-semibold text-ink">{c.name}</h3>
                {c.reason && <p className="m-0 text-meta text-ink3">{c.reason}</p>}
              </div>
              <ul className="list-none m-0 p-0">
                {c.industries.map((i) => (
                  <li
                    key={i.key}
                    className="px-4 py-2 border-t border-rule flex flex-col gap-0.5 md:flex-row md:items-baseline md:justify-between md:gap-4"
                  >
                    <span className="text-body text-ink">{i.industry}</span>
                    <span className="text-meta text-ink3 tnum">
                      SIC {i.codes} · {i.basis}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        <section aria-labelledby="unmapped-title" className="flex flex-col gap-3">
          <h2 id="unmapped-title" className="m-0 text-heading font-semibold text-ink">
            Committees not mapped
          </h2>
          <ul className="list-none m-0 p-0 border border-rule rounded-card">
            {model.unmapped.map((c, n) => (
              <li
                key={c.key}
                className={`px-4 py-2 flex flex-col gap-0.5 ${n ? 'border-t border-rule' : ''}`}
              >
                <span className="text-body text-ink">{c.name}</span>
                {c.reason && <span className="text-meta text-ink3">{c.reason}</span>}
              </li>
            ))}
          </ul>
        </section>
      </ReadingPage>
    </PageShell>
  );
}
