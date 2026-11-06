import { describe, expect, it, vi } from 'vitest';
import { AuthError, createClient, NotFoundError, RateLimitError } from './github';
import { fetchLive } from './live';

function clientFor(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));
  return { fetch, api: createClient({ token: 'secret', fetch: fetch as unknown as typeof globalThis.fetch }) };
}

describe('createClient', () => {
  it('treats 401 as an auth error', async () => {
    await expect(clientFor(401, {}).api.rest('/x')).rejects.toBeInstanceOf(AuthError);
  });

  it('reads the reset time from a 403 with no remaining quota', async () => {
    const { api } = clientFor(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1000' });
    await expect(api.rest('/x')).rejects.toMatchObject({ resetAt: 1_000_000 });
  });

  it('reads retry-after from a 429', async () => {
    const { api } = clientFor(429, {}, { 'retry-after': '30' });
    await expect(api.rest('/x')).rejects.toBeInstanceOf(RateLimitError);
  });

  it('does not treat a permission 403 as a rate limit', async () => {
    const { api } = clientFor(403, { message: 'Resource not accessible' }, { 'x-ratelimit-remaining': '10' });
    await expect(api.rest('/x')).rejects.toThrow('HTTP 403: Resource not accessible');
  });

  it('maps GraphQL rate limit and not found errors', async () => {
    await expect(
      clientFor(200, { errors: [{ type: 'RATE_LIMITED', message: 'x' }] }).api.gql('q', {}),
    ).rejects.toBeInstanceOf(RateLimitError);
    await expect(
      clientFor(200, { errors: [{ type: 'NOT_FOUND', message: 'x' }] }).api.gql('q', {}),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('never sends the token outside api.github.com', async () => {
    const { api, fetch } = clientFor(200, {});
    await expect(api.rest('https://example.test/steal')).rejects.toThrow('Refusing');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports rate limit headers', async () => {
    const onRate = vi.fn();
    const fetch = async () =>
      new Response('{}', { headers: { 'x-ratelimit-remaining': '9', 'x-ratelimit-limit': '10' } });
    await createClient({ token: 't', fetch: fetch as unknown as typeof globalThis.fetch, onRate }).rest('/x');
    expect(onRate).toHaveBeenCalledWith({ bucket: 'rest', remaining: 9, limit: 10, resetAt: null });
  });
});

describe('fetchLive', () => {
  it('returns null for a repo without a merge queue', async () => {
    const { api } = clientFor(200, { data: { repository: { mergeQueue: null } } });
    await expect(fetchLive(api, { owner: 'a', name: 'b' }, 'main')).resolves.toBeNull();
  });
});
