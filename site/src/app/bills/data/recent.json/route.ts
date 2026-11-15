import { api } from '@/lib/api';
import { toRow } from '@/lib/billIndex';

export const dynamic = 'force-static';

/* /bills/data/recent.json: the bills that moved in the 45 days before the build, which is what the page opens on for the browse page (ADR 0025). */
export async function GET() {
  const bills = await api.billIndexAll();
  const cutoff = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10);
  const recent = bills.filter((b) => (b.latest_action_date ?? b.introduced_date ?? '') >= cutoff);
  // the topic list covers the whole Congress, so the filter is complete before all.json loads
  const topics = [...new Set(bills.map((b) => b.policy_area).filter((t): t is string => Boolean(t)))].sort();
  return Response.json({ congress: bills[0]?.congress ?? 0, total: bills.length, topics, rows: recent.map(toRow) });
}
