/** Build-time reads from the Phase 1d API. Runs only inside `next build`; nothing here ships to
 *  the browser. API_BASE_URL must point at a running API (the nightly job starts one against the
 *  managed database). */
import type {
  BillDetail,
  BillListItem,
  BillsResponse,
  CommitteesResponse,
  CongressOverviewResponse,
  ConstituencyResponse,
  FeedItem,
  FeedResponse,
  FreshnessResponse,
  FundraisingResponse,
  ContactResponse,
  KeyDatesResponse,
  MemberDetail,
  MembersResponse,
  SessionsResponse,
  StatementsResponse,
  StockTradesResponse,
} from './types';

function baseUrl(): string {
  const url = process.env.API_BASE_URL;
  if (!url) {
    throw new Error('API_BASE_URL is not set; the site is generated from the API at build time');
  }
  return url.replace(/\/$/, '');
}

/** Waits before each retry of a request that failed with a server error or never connected. A
 *  4xx is a real answer and is not retried. One transient 500 (the API's database pool timing
 *  out under load, as on the 2026-09-20 deploy) must not fail a build of thousands of pages, and
 *  the wait gives the API time to drain; a request that still fails after the last retry fails
 *  the build as before. */
export const RETRY_DELAYS_MS = [1_000, 3_000, 9_000];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function getJson<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    let problem = '';
    let response: Response | undefined;
    try {
      response = await fetch(`${baseUrl()}${path}`, { cache: 'force-cache' });
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }
    if (response) {
      if (response.ok) return (await response.json()) as T;
      if (response.status < 500) throw new Error(`${path} -> HTTP ${response.status}`);
      problem = `HTTP ${response.status}`;
    }
    if (attempt >= RETRY_DELAYS_MS.length) {
      throw new Error(`${path} -> ${problem} (after ${attempt + 1} attempts)`);
    }
    console.warn(
      `${path} -> ${problem}; retrying in ${RETRY_DELAYS_MS[attempt] / 1000}s (attempt ${attempt + 2} of ${RETRY_DELAYS_MS.length + 1})`,
    );
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
}

export const api = {
  members: () => getJson<MembersResponse>('/api/v1/members'),
  member: (bioguide: string) => getJson<MemberDetail>(`/api/v1/members/${bioguide}`),
  committees: (bioguide: string) =>
    getJson<CommitteesResponse>(`/api/v1/members/${bioguide}/committees`),
  contact: (bioguide: string) => getJson<ContactResponse>(`/api/v1/members/${bioguide}/contact`),
  statements: (bioguide: string) =>
    getJson<StatementsResponse>(`/api/v1/members/${bioguide}/statements`),
  stockTrades: (bioguide: string) =>
    getJson<StockTradesResponse>(`/api/v1/members/${bioguide}/stock-trades`),
  constituency: (bioguide: string) =>
    getJson<ConstituencyResponse>(`/api/v1/members/${bioguide}/constituency`),
  keyDates: (bioguide: string) => getJson<KeyDatesResponse>(`/api/v1/members/${bioguide}/key-dates`),
  fundraising: (bioguide: string) =>
    getJson<FundraisingResponse>(`/api/v1/members/${bioguide}/fundraising`),
  congressOverview: () => getJson<CongressOverviewResponse>('/api/v1/congress/overview'),
  sessions: () => getJson<SessionsResponse>('/api/v1/meta/sessions'),
  freshness: () => getJson<FreshnessResponse>('/api/v1/meta/freshness'),
  bills: (limit: number, offset: number) =>
    getJson<BillsResponse>(`/api/v1/bills?limit=${limit}&offset=${offset}`),
  bill: (congress: number, billType: string, billNumber: string) =>
    getJson<BillDetail>(`/api/v1/bills/${congress}/${billType}/${billNumber}`),
  /** Every bill with a detail page, paging until the API has returned `total`. */
  billsAll: async (): Promise<BillListItem[]> => {
    const page = 500;
    const items: BillListItem[] = [];
    for (let offset = 0; ; offset += page) {
      const body = await getJson<BillsResponse>(`/api/v1/bills?limit=${page}&offset=${offset}`);
      items.push(...body.items);
      if (items.length >= body.total || body.items.length === 0) return items;
    }
  },
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
