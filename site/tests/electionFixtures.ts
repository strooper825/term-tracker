import { join } from 'node:path';
import type { SeatHolder } from '@/lib/types';

/** The election files as they were first shipped: every race, no candidates, nothing called.
 *  Tests read these and never site/content, which the owner edits: a result entered at /admin
 *  must not be able to fail a test. */
export const FIXTURES = join(process.cwd(), 'tests', 'fixtures');

// Every senator of the 119th Congress by state, class and party, as GET /congress/seats lists
// them. I is an independent who caucuses with the Democrats (King and Sanders).
const SENATE =
  'AK 2R 3R,AL 2R 3R,AR 2R 3R,AZ 1D 3D,CA 1D 3D,CO 2D 3D,CT 1D 3D,DE 1D 2D,FL 1R 3R,GA 2D 3D,HI 1D 3D,IA 2R 3R,' +
  'ID 2R 3R,IL 2D 3D,IN 1R 3R,KS 2R 3R,KY 2R 3R,LA 2R 3R,MA 1D 2D,MD 1D 3D,ME 1I 2R,MI 1D 2D,MN 1D 2D,MO 1R 3R,' +
  'MS 1R 2R,MT 1R 2R,NC 2R 3R,ND 1R 3R,NE 1R 2R,NH 2D 3D,NJ 1D 2D,NM 1D 2D,NV 1D 3D,NY 1D 3D,OH 1R 3R,OK 2R 3R,' +
  'OR 2D 3D,PA 1R 3D,RI 1D 2D,SC 2R 3R,SD 2R 3R,TN 1R 2R,TX 1R 2R,UT 1R 3R,VA 1D 2D,VT 1I 3D,WA 1D 3D,WI 1D 3R,' +
  'WV 1R 2R,WY 1R 2R';

const PARTY = { D: 'Democrat', R: 'Republican', I: 'Independent' } as const;

/** One senator. Arkansas's class 2 seat is Tom Cotton, tracked, so it has a profile to link. */
export function senator(state: string, senateClass: number, party: keyof typeof PARTY): SeatHolder {
  const cotton = state === 'AR' && senateClass === 2;
  return {
    seat_key: `senate-${state}-${senateClass}`,
    chamber: 'senate',
    state,
    state_name: state,
    district: null,
    senate_class: senateClass,
    state_rank: null,
    bioguide_id: cotton ? 'C001095' : `X${state}${senateClass}`,
    name: cotton ? 'Tom Cotton' : `Senator ${state}-${senateClass}`,
    last_name: cotton ? 'Cotton' : state,
    party: PARTY[party],
    caucus: party === 'I' ? 'Democrat' : null,
    is_tracked: cotton,
    photo_url: '',
    website_url: null,
  };
}

export const SENATORS: SeatHolder[] = SENATE.split(',').flatMap((entry) => {
  const [state, ...seats] = entry.split(' ');
  return seats.map((s) => senator(state, Number(s[0]), s[1] as keyof typeof PARTY));
});
