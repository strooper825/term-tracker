import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, RETRY_DELAYS_MS } from '@/lib/api';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('build-time API reads', () => {
  beforeEach(() => {
    process.env.API_BASE_URL = 'http://127.0.0.1:8000/';
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns the body of a good response with one request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { bioguide_id: 'S000033' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.member('S000033')).resolves.toEqual({ bioguide_id: 'S000033' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8000/api/v1/members/S000033');
  });

  it('retries a server error after a wait and returns the answer that follows', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(500))
      .mockResolvedValueOnce(json(503))
      .mockResolvedValueOnce(json(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const result = api.contact('S000033');
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] + RETRY_DELAYS_MS[1]);
    await expect(result).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('retries a request that never connected', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(json(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const result = api.keyDates('S000033');
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    await expect(result).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 404: that is an answer, not an outage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(404));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.fundraising('X000000')).rejects.toThrow(
      '/api/v1/members/X000000/fundraising -> HTTP 404',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails the build once the retries are used up, and says how many attempts it made', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(500));
    vi.stubGlobal('fetch', fetchMock);
    const result = api.statements('J000294');
    const settled = expect(result).rejects.toThrow(
      '/api/v1/members/J000294/statements -> HTTP 500 (after 4 attempts)',
    );
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS.reduce((a, b) => a + b, 0));
    await settled;
    expect(fetchMock).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1);
  });
});
