import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheKey } from '../core/storage';
import { isInstalled, needsInstall, useAuth } from './auth';
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

const signIn = (token = 't') =>
  useAuth.setState({
    status: 'signed_in',
    login: 'me',
    accounts: [{ login: 'acme', type: 'Organization' }],
    owner: 'acme',
    token,
  });

const settle = () => vi.advanceTimersByTimeAsync(1);

describe('stores', () => {
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    quota().clear();
    useSettings.setState({ repo: null, branch: null, workflowByRepo: {} });
    useAuth.setState({ status: 'signed_out', login: null, accounts: [], owner: null, token: null, tokenError: null, installCheck: 'idle' });
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
    signIn('t');
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
    signIn('secret-token');
    await settle();
    expect(writes.mock.calls.flat().join()).not.toContain('secret-token');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}')));
    await useAuth.getState().logOut();
    expect(useAuth.getState().status).toBe('signed_out');
    expect(useAuth.getState().token).toBeNull();
    expect(localStorage.getItem(key)).toContain('"1"');
    expect(Object.keys(useData.getState().attempts.prs)).toEqual(['1']);

    const calls = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10 * 60e3);
    expect(fetch.mock.calls.length).toBe(calls);
  });

  it('asks the login service for a token for the repo owner', async () => {
    const authCalls: [string, RequestInit | undefined][] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: URL | string, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith('/me')) return new Response(JSON.stringify({ login: 'me', accounts: [{ login: 'Acme', type: 'Organization' }] }));
      if (href.endsWith('/token')) {
        authCalls.push([href, init]);
        return new Response(JSON.stringify({ token: 'scoped', expires_at: null }));
      }
      return new Response(JSON.stringify({ data: { repository: { defaultBranchRef: { name: 'trunk' } } } }));
    }));
    useSettings.getState().setRepo('acme/widgets');
    await useAuth.getState().checkLogin();
    await settle();
    expect(authCalls.map(([, init]) => init?.body)).toEqual(['{"target":"acme"}']);
    expect(useAuth.getState().token).toBe('scoped');
  });

  it('asks for no token when the app is not installed on the repo owner', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ login: 'me', accounts: [{ login: 'other', type: 'User' }] })));
    vi.stubGlobal('fetch', fetch);
    useSettings.getState().setRepo('acme/widgets');
    await useAuth.getState().checkLogin();
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(useAuth.getState().token).toBeNull();
    expect(isInstalled(useAuth.getState())).toBe(false);
  });

  describe('installing the GitHub App', () => {
    const stubMe = (...replies: { login: string; type: string }[][]) => {
      const calls: string[] = [];
      const fetch = vi.fn(async (url: string) => {
        calls.push(url);
        if (url.endsWith('/token')) return new Response(JSON.stringify({ token: 'scoped', expires_at: null }));
        const accounts = replies.length > 1 ? replies.shift() : replies[0];
        return new Response(JSON.stringify({ login: 'me', accounts }));
      });
      vi.stubGlobal('fetch', fetch);
      return calls;
    };
    const acme = { login: 'acme', type: 'Organization' };

    it('shows the guide when the login has no accounts', async () => {
      stubMe([]);
      await useAuth.getState().checkLogin();
      await settle();
      expect(needsInstall(useAuth.getState())).toBe(true);
    });

    it('shows the guide when the viewed owner is not among the accounts', async () => {
      stubMe([{ login: 'other', type: 'User' }]);
      useSettings.getState().setRepo('acme/widgets');
      await useAuth.getState().checkLogin();
      await settle();
      expect(needsInstall(useAuth.getState())).toBe(true);
    });

    it('hides the guide when signed out', () => {
      expect(needsInstall(useAuth.getState())).toBe(false);
    });

    it('moves on and gets a token when a re-check finds the viewed owner', async () => {
      stubMe([], [acme]);
      useSettings.getState().setRepo('acme/widgets');
      await useAuth.getState().checkLogin();
      await settle();
      await useAuth.getState().recheckInstall();
      await settle();
      expect(needsInstall(useAuth.getState())).toBe(false);
      expect(useAuth.getState().installCheck).toBe('idle');
      expect(useAuth.getState().token).toBe('scoped');
    });

    it('moves on when a re-check finds an account and no repo is chosen', async () => {
      const calls = stubMe([], [acme]);
      await useAuth.getState().checkLogin();
      await settle();
      await useAuth.getState().recheckInstall();
      await settle();
      expect(useAuth.getState().owner).toBe('acme');
      expect(needsInstall(useAuth.getState())).toBe(false);
      expect(useAuth.getState().token).toBe('scoped');
      expect(calls.filter((url) => url.endsWith('/token'))).toHaveLength(1);
    });

    it('stays on the guide and says so when a re-check finds nothing', async () => {
      stubMe([]);
      await useAuth.getState().checkLogin();
      await settle();
      const check = useAuth.getState().recheckInstall();
      expect(useAuth.getState().installCheck).toBe('checking');
      await check;
      expect(useAuth.getState().installCheck).toBe('not_found');
      expect(needsInstall(useAuth.getState())).toBe(true);
    });

    it('stays signed in when a re-check cannot reach the login service', async () => {
      stubMe([]);
      await useAuth.getState().checkLogin();
      await settle();
      vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
      await useAuth.getState().recheckInstall();
      expect(useAuth.getState().status).toBe('signed_in');
      expect(useAuth.getState().installCheck).toBe('failed');
    });

    it('shows the login when a re-check finds the session gone', async () => {
      stubMe([]);
      await useAuth.getState().checkLogin();
      await settle();
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
      await useAuth.getState().recheckInstall();
      expect(useAuth.getState().status).toBe('signed_out');
    });
  });

  it('shows the login when the service says not signed in', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"not_signed_in"}', { status: 401 })));
    await useAuth.getState().checkLogin();
    expect(useAuth.getState().status).toBe('signed_out');
  });

  it('does not overlap the same action', async () => {
    const { fetch } = stubGitHub(healthy);
    useSettings.getState().setRepo('acme/widgets', 'main');
    signIn('t');
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
    signIn('t');
    await settle();
    expect(useData.getState().queueState).toBe('no_queue');
    expect(urls.length).toBe(1);
  });

  it('gets a fresh token when GitHub returns 401, and stops if that one is rejected too', async () => {
    let denied = true;
    const tokens: string[] = [];
    const { fetch } = stubGitHub((q, u) => {
      if (u.endsWith('/token')) {
        tokens.push('fresh');
        return { body: { token: 'fresh', expires_at: null } };
      }
      return denied ? { status: 401, body: {} } : healthy(q, u);
    });
    useSettings.getState().setRepo('acme/widgets', 'main');
    vi.setSystemTime(NOW + 60 * 60e3);
    signIn('old');
    await settle();
    expect(tokens.length).toBe(1);
    expect(useAuth.getState().token).toBe('fresh');
    expect(useData.getState().authError).toBe(true);

    const calls = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10 * 60e3);
    expect(fetch.mock.calls.length).toBe(calls);

    denied = false;
    signIn('good');
    await settle();
    expect(useData.getState().authError).toBe(false);
    expect(useData.getState().queueState).toBe('ready');
  });

  it('renews the token before it expires', async () => {
    let issued = 0;
    stubGitHub((q, u) => {
      if (!u.endsWith('/token')) return healthy(q, u);
      issued += 1;
      return { body: { token: `t${issued}`, expires_at: new Date(Date.now() + 8 * 3600e3).toISOString() } };
    });
    useSettings.getState().setRepo('acme/widgets', 'main');
    useAuth.setState({ status: 'signed_in', login: 'me', accounts: [{ login: 'acme', type: 'Organization' }], owner: 'acme' });
    await useAuth.getState().requestToken();
    expect(useAuth.getState().token).toBe('t1');
    await vi.advanceTimersByTimeAsync(8 * 3600e3 - 5 * 60e3 - 1000);
    expect(useAuth.getState().token).toBe('t1');
    await vi.advanceTimersByTimeAsync(2000);
    expect(useAuth.getState().token).toBe('t2');
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
    signIn('t');
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
    signIn('t');
    await settle();
    expect(useData.getState().storageError).toBe('quota');
    expect(useData.getState().attempts.backfillDone).toBe(true);
  });
});
