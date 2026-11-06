const API_ORIGIN = 'https://api.github.com';

export class AuthError extends Error {
  constructor() {
    super('GitHub rejected the token.');
    this.name = 'AuthError';
  }
}

export class RateLimitError extends Error {
  constructor(readonly resetAt: number) {
    super('GitHub rate limit reached.');
    this.name = 'RateLimitError';
  }
}

export class NotFoundError extends Error {
  constructor() {
    super('GitHub could not find this repository, or the token cannot see it.');
    this.name = 'NotFoundError';
  }
}

export interface RateInfo {
  bucket: 'graphql' | 'rest';
  remaining: number;
  limit: number | null;
  resetAt: number | null;
}

export interface GitHubClient {
  gql<T>(query: string, variables: Record<string, unknown>): Promise<T>;
  rest<T>(path: string): Promise<T>;
}

export interface ClientOptions {
  token: string;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
  onRate?: (info: RateInfo) => void;
}

const FALLBACK_PAUSE_MS = 60e3;

function resetTime(headers: Headers): number {
  const retryAfter = Number(headers.get('retry-after'));
  if (retryAfter > 0) return Date.now() + retryAfter * 1000;
  const reset = Number(headers.get('x-ratelimit-reset'));
  if (reset > 0) return reset * 1000;
  return Date.now() + FALLBACK_PAUSE_MS;
}

function rateInfo(bucket: RateInfo['bucket'], headers: Headers): RateInfo | null {
  const remaining = headers.get('x-ratelimit-remaining');
  if (remaining === null) return null;
  const limit = headers.get('x-ratelimit-limit');
  const reset = headers.get('x-ratelimit-reset');
  return {
    bucket,
    remaining: Number(remaining),
    limit: limit === null ? null : Number(limit),
    resetAt: reset === null ? null : Number(reset) * 1000,
  };
}

async function messageOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : '';
  } catch {
    return '';
  }
}

async function throwForStatus(res: Response, label: string): Promise<void> {
  if (res.ok) return;
  if (res.status === 401) throw new AuthError();
  const message = await messageOf(res);
  const limited =
    res.status === 429 ||
    (res.status === 403 &&
      (res.headers.get('x-ratelimit-remaining') === '0' ||
        res.headers.has('retry-after') ||
        /rate limit/i.test(message)));
  if (limited) throw new RateLimitError(resetTime(res.headers));
  throw new Error(`${label} failed with HTTP ${res.status}${message ? `: ${message}` : ''}`);
}

export function createClient({ token, fetch: fetchImpl, signal, onRate }: ClientOptions): GitHubClient {
  const send = (url: URL, init: RequestInit): Promise<Response> => {
    if (url.origin !== API_ORIGIN) throw new Error('Refusing to send the token outside api.github.com.');
    return (fetchImpl ?? globalThis.fetch)(url, {
      ...init,
      signal,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
  };

  const report = (bucket: RateInfo['bucket'], headers: Headers): void => {
    const info = rateInfo(bucket, headers);
    if (info) onRate?.(info);
  };

  return {
    async gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
      const res = await send(new URL('/graphql', API_ORIGIN), {
        method: 'POST',
        body: JSON.stringify({ query, variables }),
      });
      report('graphql', res.headers);
      await throwForStatus(res, 'GraphQL request');
      const body = (await res.json()) as {
        data: T;
        errors?: { type?: string; message: string }[];
      };
      const first = body.errors?.[0];
      if (first?.type === 'RATE_LIMITED') throw new RateLimitError(resetTime(res.headers));
      if (first?.type === 'NOT_FOUND') throw new NotFoundError();
      if (first) throw new Error(first.message);
      return body.data;
    },

    async rest<T>(path: string): Promise<T> {
      const res = await send(new URL(path, API_ORIGIN), {});
      report('rest', res.headers);
      await throwForStatus(res, 'REST request');
      return (await res.json()) as T;
    },
  };
}
