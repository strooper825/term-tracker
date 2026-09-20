import type { Metadata } from 'next';
import { MemberDashboard } from '@/components/MemberDashboard';
import { dashboardProps, memberTitle, trackedBioguides } from '@/lib/pages';

export const dynamic = 'force-static';
export const dynamicParams = false;

/* One page per row of the tracked_members seed, read through GET /members at build time. */
export async function generateStaticParams() {
  const ids = await trackedBioguides();
  return ids.map((bioguide) => ({ bioguide }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bioguide: string }>;
}): Promise<Metadata> {
  const { bioguide } = await params;
  return { title: `${await memberTitle(bioguide)} · Term Tracker` };
}

export default async function MemberPage({ params }: { params: Promise<{ bioguide: string }> }) {
  const { bioguide } = await params;
  const props = await dashboardProps(bioguide);
  return <MemberDashboard {...props} />;
}
