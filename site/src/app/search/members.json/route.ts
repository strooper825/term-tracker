import { api } from '@/lib/api';
import { memberHits, toMapSeat } from '@/lib/seats';

export const dynamic = 'force-static';

/* /search/members.json: every member of Congress for the search box, written at build time and
   fetched by the browser only when someone starts typing (ADR 0022). */
export async function GET() {
  const { seats } = await api.seats();
  return Response.json(memberHits(seats.map(toMapSeat)));
}
