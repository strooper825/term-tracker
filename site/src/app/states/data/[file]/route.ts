import { api } from '@/lib/api';
import { toMapData } from '@/lib/states';

export const dynamic = 'force-static';
export const dynamicParams = false;

/* /states/data/{abbr}.json: one state's districts and legislators as short rows, fetched by the
   legislature map when its page opens (ADR 0035). A separate file, not page props, so the rows
   are not written into the page twice (HTML and the inline React payload). */
export async function generateStaticParams() {
  const { states } = await api.states();
  return states.map((s) => ({ file: `${s.state.toLowerCase()}.json` }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const detail = await api.state(file.replace(/\.json$/, ''));
  return Response.json(toMapData(detail));
}
