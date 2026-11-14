import type { Metadata } from 'next';
import { BillPage } from '@/components/BillPage';
import { PageShell } from '@/components/SiteFrame';
import { billPageProps, billRouteParams, isNoBillsRoute } from '@/lib/pages';

export const dynamic = 'force-static';
export const dynamicParams = false;

/* One page per row of mart.bill, read through GET /bills at build time. While the dataset
   holds no bill (the first days of a Congress) there is one placeholder route instead. */
export async function generateStaticParams() {
  return billRouteParams();
}

type Params = Promise<{ congress: string; type: string; number: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { congress, type, number } = await params;
  if (isNoBillsRoute(type)) return { title: 'No bills yet · Term' };
  const props = await billPageProps(Number(congress), type, number);
  return {
    title: `${props.bill.label} · Term`,
    description: `${props.bill.label}: ${props.bill.title}`,
  };
}

function NoBillsYet() {
  return (
    <PageShell active="Congress">
        <main className="px-7 py-12">
          <h1 className="text-ink m-0 mb-2">No bills yet</h1>
          <p className="text-ink2 m-0">
            No tracked member has sponsored or cosponsored a bill in this Congress so far. Bill
            pages appear here after the first nightly update that finds one.
          </p>
        </main>
    </PageShell>
  );
}

export default async function Bill({ params }: { params: Params }) {
  const { congress, type, number } = await params;
  if (isNoBillsRoute(type)) return <NoBillsYet />;
  const props = await billPageProps(Number(congress), type, number);
  return <BillPage {...props} />;
}
