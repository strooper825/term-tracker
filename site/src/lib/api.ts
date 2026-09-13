/** Build-time reads from the Phase 1d API. Runs only inside `next build`; nothing here ships to
 *  the browser. API_BASE_URL must point at a running API (the nightly job starts one against the
 *  managed database). */
import type {
  CommitteesResponse,
  FeedItem,
  FeedResponse,
  FreshnessResponse,
  FundraisingResponse,
  KeyDatesResponse,
  MemberDetail,
  MembersResponse,
  TimelineResponse,
} from './types';

function baseUrl(): string {
  const url = process.env.API_BASE_URL;
  if (!url) {
    throw new Error('API_BASE_URL is not set; the site is generated from the API at build time');
  }
  return url.replace(/\/$/, '');
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`${path} -> HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export const api = {
  members: () => getJson<MembersResponse>('/api/v1/members'),
  member: (bioguide: string) => getJson<MemberDetail>(`/api/v1/members/${bioguide}`),
  timeline: (bioguide: string, from: string, to: string) =>
    getJson<TimelineResponse>(`/api/v1/members/${bioguide}/timeline?from=${from}&to=${to}`),
  committees: (bioguide: string) =>
    getJson<CommitteesResponse>(`/api/v1/members/${bioguide}/committees`),
  keyDates: (bioguide: string) => getJson<KeyDatesResponse>(`/api/v1/members/${bioguide}/key-dates`),
  fundraising: (bioguide: string) =>
    getJson<FundraisingResponse>(`/api/v1/members/${bioguide}/fundraising`),
  freshness: () => getJson<FreshnessResponse>('/api/v1/meta/freshness'),
  /** Every feed event, following the cursor until the API says there are no more. */
  feedAll: async (bioguide: string): Promise<FeedItem[]> => {
    const items: FeedItem[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 500; page += 1) {
      const query = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      const body: FeedResponse = await getJson<FeedResponse>(
        `/api/v1/members/${bioguide}/feed?limit=200${query}`,
      );
      items.push(...body.items);
      cursor = body.next_cursor;
      if (!cursor) break;
    }
    return items;
  },
};
