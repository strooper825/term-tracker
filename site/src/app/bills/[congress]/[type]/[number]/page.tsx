import type { Metadata } from 'next';
import { BillPage } from '@/components/BillPage';
import { billPageProps, billRouteParams } from '@/lib/pages';

export const dynamic = 'force-static';
export const dynamicParams = false;

/* One page per row of mart.bill, read through GET /bills at build time. */
export async function generateStaticParams() {
  return billRouteParams();
}

type Params = Promise<{ congress: string; type: string; number: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { congress, type, number } = await params;
  const props = await billPageProps(Number(congress), type, number);
  return {
    title: `${props.bill.label} · Term Tracker`,
    description: `${props.bill.label}: ${props.bill.title}`,
  };
}

export default async function Bill({ params }: { params: Params }) {
  const { congress, type, number } = await params;
  const props = await billPageProps(Number(congress), type, number);
  return <BillPage {...props} />;
}
