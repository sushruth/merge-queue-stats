import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheKey } from '../core/storage';
import { useAuth } from './auth';
import { startApp } from './bootstrap';
import { useData } from './data';
import { useSettings } from './settings';

const NOW = Date.parse('2026-06-10T12:00:00Z');
const quota = () => localStorage as unknown as { quotaExceeded: boolean; clear(): void };

type Route = (query: string, url: string) => { status?: number; body: unknown; headers?: Record<string, string> };

function stubGitHub(route: Route) {
  const urls: string[] = [];
  const fetch = vi.fn(async (url: URL, init?: RequestInit) => {
    urls.push(String(url));
    const query = init?.body ? (JSON.parse(String(init.body)).query as string) : '';
    const { status = 200, body, headers } = route(query, String(url));
    return new Response(JSON.stringify(body), { status, headers });
  });
  vi.stubGlobal('fetch', fetch);
  return { fetch, urls };
}

const healthy: Route = (query) => {
  if (query.includes('defaultBranchRef')) return { body: { data: { repository: { defaultBranchRef: { name: 'trunk' } } } } };
  if (query.includes('mergeQueue')) return { body: { data: { repository: { mergeQueue: { entries: { nodes: [] } } } } } };
  if (query.includes('pullRequests')) {
    return {
      body: {
        data: { repository: { pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } },
      },
    };
  }
  return { body: { total_count: 0, workflow_runs: [] } };
};

const settle = () => vi.advanceTimersByTimeAsync(1);

describe('stores', () => {
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    quota().clear();
    useSettings.setState({ repo: null, branch: null, workflowByRepo: {} });
    useAuth.setState({ token: null });
    stop = startApp();
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('accepts no repo and no token without fetching', async () => {
    const { fetch } = stubGitHub(healthy);
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    useSettings.getState().setRepo('acme/widgets');
    await settle();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('resolves the default branch, then syncs, and only calls api.github.com', async () => {
    const { urls } = stubGitHub(healthy);
    useSettings.getState().setRepo('acme/widgets');
    useAuth.getState().setToken('t');
    await settle();
    expect(useSettings.getState().branch).toBe('trunk');
    expect(useData.getState().queueState).toBe('ready');
    expect(useData.getState().attempts.backfillDone).toBe(true);
    expect(urls.every((u) => u.startsWith('https://api.github.com/'))).toBe(true);
    expect(localStorage.getItem(cacheKey('attempts', 'acme/widgets', 'trunk'))).toContain('backfillDone');
  });

  it('keeps two repos apart in the cache', async () => {
    const a = cacheKey('attempts', 'acme/widgets', 'main');
    const b = cacheKey('attempts', 'acme/gears', 'main');
    expect(a).not.toBe(b);
    expect(cacheKey('attempts', 'ACME/Widgets', 'main')).toBe(a);
    expect(cacheKey('attempts', 'acme/widgets', 'dev')).not.toBe(a);

    localStorage.setItem(a, JSON.stringify({ prs: { 1: [[1, 2, 'merged']] } }));
    localStorage.setItem(b, JSON.stringify({ prs: { 2: [[3, 4, 'merged']] } }));
    useSettings.getState().setRepo('acme/widgets', 'main');
    expect(Object.keys(useData.getState().attempts.prs)).toEqual(['1']);
    useSettings.getState().setRepo('acme/gears', 'main');
    expect(Object.keys(useData.getState().attempts.prs)).toEqual(['2']);
  });

  it('clearing the token keeps the cache, removes the token and stops polling', async () => {
    const { fetch } = stubGitHub(healthy);
    const key = cacheKey('attempts', 'acme/widgets', 'main');
    localStorage.setItem(key, JSON.stringify({ prs: { 1: [[1, 2, 'merged']] } }));
    useSettings.getState().setRepo('acme/widgets', 'main');
    const writes = vi.spyOn(localStorage, 'setItem');
    useAuth.getState().setToken('secret-token');
    await settle();
    expect(writes.mock.calls.flat().join()).not.toContain('secret-token');

    useAuth.getState().clearToken();
    expect(useAuth.getState().token).toBeNull();
    expect(localStorage.getItem(key)).toContain('"1"');
    expect(Object.keys(useData.getState().attempts.prs)).toEqual(['1']);

    const calls = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10 * 60e3);
    expect(fetch.mock.calls.length).toBe(calls);
  });

  it('does not overlap the same action', async () => {
    const { fetch } = stubGitHub(healthy);
    useSettings.getState().setRepo('acme/widgets', 'main');
    useAuth.getState().setToken('t');
    await settle();
    fetch.mockClear();
    const { refreshLive } = useData.getState();
    await Promise.all([refreshLive(), refreshLive()]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces a repo without a merge queue and skips history', async () => {
    const { urls } = stubGitHub((query) =>
      query.includes('mergeQueue')
        ? { body: { data: { repository: { mergeQueue: null } } } }
        : healthy(query, ''),
    );
    useSettings.getState().setRepo('acme/widgets', 'main');
    useAuth.getState().setToken('t');
    await settle();
    expect(useData.getState().queueState).toBe('no_queue');
    expect(urls.length).toBe(1);
  });

  it('stops on 401 until a new token is set', async () => {
    let denied = true;
    const { fetch } = stubGitHub((q, u) => (denied ? { status: 401, body: {} } : healthy(q, u)));
    useSettings.getState().setRepo('acme/widgets', 'main');
    useAuth.getState().setToken('bad');
    await settle();
    expect(useData.getState().authError).toBe(true);

    const calls = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10 * 60e3);
    expect(fetch.mock.calls.length).toBe(calls);

    denied = false;
    useAuth.getState().setToken('good');
    await settle();
    expect(useData.getState().authError).toBe(false);
    expect(useData.getState().queueState).toBe('ready');
  });

  it('pauses on a rate limit until the reset time', async () => {
    const resetAt = NOW + 10 * 60e3;
    let limited = true;
    const { fetch } = stubGitHub((q, u) =>
      limited
        ? {
            status: 403,
            body: {},
            headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetAt / 1000) },
          }
        : healthy(q, u),
    );
    useSettings.getState().setRepo('acme/widgets', 'main');
    useAuth.getState().setToken('t');
    await settle();
    expect(useData.getState().rateLimitedUntil).toBe(resetAt);

    const calls = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5 * 60e3);
    expect(fetch.mock.calls.length).toBe(calls);

    limited = false;
    await vi.advanceTimersByTimeAsync(6 * 60e3);
    expect(useData.getState().rateLimitedUntil).toBeNull();
    expect(fetch.mock.calls.length).toBeGreaterThan(calls);
  });

  it('surfaces a quota failure and keeps data in memory', async () => {
    stubGitHub(healthy);
    useSettings.getState().setRepo('acme/widgets', 'main');
    quota().quotaExceeded = true;
    useAuth.getState().setToken('t');
    await settle();
    expect(useData.getState().storageError).toBe('quota');
    expect(useData.getState().attempts.backfillDone).toBe(true);
  });
});
