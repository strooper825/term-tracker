import { api } from '@/lib/api';
import { billEntries } from '@/lib/seats';

export const dynamic = 'force-static';

/* /search/bills.json: every bill with a page on the site, for the search box's Bills tab.
   Fetched by the browser only when that tab is searched (ADR 0022). */
export async function GET() {
  return Response.json(billEntries(await api.billsAll()));
}
