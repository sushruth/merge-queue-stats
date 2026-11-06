import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMe, fetchToken, loginUrl, logOut, NotSignedInError } from './auth';

function stubAuth(status: number, body: unknown) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('auth service client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds a login link that returns to the current page', () => {
    expect(loginUrl('https://mergeq.frustrated.dev/?repo=a/b&days=14')).toBe(
      'https://auth.frustrated.dev/login?return_to=https%3A%2F%2Fmergeq.frustrated.dev%2F%3Frepo%3Da%2Fb%26days%3D14',
    );
  });

  it('reads the signed-in user with the session cookie', async () => {
    const fetch = stubAuth(200, { login: 'me', accounts: [{ login: 'acme', type: 'Organization' }] });
    await expect(fetchMe()).resolves.toMatchObject({ login: 'me' });
    expect(fetch.mock.calls[0]![0]).toBe('https://auth.frustrated.dev/me');
    expect(fetch.mock.calls[0]![1]?.credentials).toBe('include');
    expect(fetch.mock.calls[0]![1]?.cache).toBe('no-store');
  });

  it('treats 401 as not signed in', async () => {
    stubAuth(401, { error: 'not_signed_in' });
    await expect(fetchMe()).rejects.toBeInstanceOf(NotSignedInError);
  });

  it('asks for a token for one account', async () => {
    const fetch = stubAuth(200, { token: 't', expires_at: null });
    await expect(fetchToken('acme')).resolves.toEqual({ token: 't', expires_at: null });
    const init = fetch.mock.calls[0]![1]!;
    expect(fetch.mock.calls[0]![0]).toBe('https://auth.frustrated.dev/token');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"target":"acme"}');
  });

  it('reports why a token was refused', async () => {
    stubAuth(502, { error: 'github_refused', status: 422 });
    await expect(fetchToken('acme')).rejects.toThrow('github_refused');
  });

  it('logs out with the session cookie', async () => {
    const fetch = stubAuth(200, { ok: true });
    await logOut();
    expect(fetch.mock.calls[0]![0]).toBe('https://auth.frustrated.dev/logout');
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: 'POST', credentials: 'include' });
  });
});
