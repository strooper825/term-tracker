import type { Metadata } from 'next';
import { ReadingPage } from '@/components/ContentBlocks';
import { PageShell } from '@/components/SiteChrome';
import { loadSite } from '@/lib/content';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Support · Term Tracker',
  description: 'Help keep Term Tracker independent and free to read.',
};

/* Route: /support, the header's Support button. The Ko-fi address is site/content/site.json
   (kofiUrl); until it is set the page says support is not open yet rather than linking nowhere. */
export default function SupportPage() {
  const { kofiUrl } = loadSite();
  return (
    <PageShell active="About">
      <ReadingPage title="Support Term Tracker">
        <p className="m-0 text-[16px] leading-relaxed text-ink">
          Term Tracker is independent, has no advertising, and is free to read. If you find it
          useful, a tip helps pay for hosting and for the time it takes to keep the records current.
        </p>
        {kofiUrl ? (
          <p className="m-0">
            <a
              href={kofiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 min-h-[48px] px-6 rounded-ctl bg-navy text-white text-[16px] font-semibold hover:bg-[#26355E]"
            >
              Leave a tip on Ko-fi ↗<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        ) : (
          <p className="m-0 px-4 py-3 rounded-card bg-lockBg text-[15px] text-ink2">
            Tips are not open yet. Check back soon.
          </p>
        )}
        <p className="m-0 text-meta text-ink2 leading-relaxed">
          Tips go to the person who runs the site. They are not tax-deductible donations, and
          tipping never buys influence over what the site covers or how.
        </p>
      </ReadingPage>
    </PageShell>
  );
}
