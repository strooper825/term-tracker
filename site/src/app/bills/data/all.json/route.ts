import { api } from '@/lib/api';
import { toRow } from '@/lib/billIndex';

export const dynamic = 'force-static';

/* /bills/data/all.json: every bill of the Congress, fetched when the page needs more than the last month for the browse page (ADR 0025). */
export async function GET() {
  const bills = await api.billIndexAll();
  return Response.json({ congress: bills[0]?.congress ?? 0, rows: bills.map(toRow) });
}
