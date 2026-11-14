import { soonRace } from '@/components/SoonRace';

export const dynamic = 'force-static';

/* Route: /elections/house, a placeholder until the House map is built (ADR 0024). */
const { metadata, Page } = soonRace('house');
export { metadata };
export default Page;
