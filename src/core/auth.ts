const AUTH_ORIGIN = 'https://auth.frustrated.dev';

export const INSTALL_URL = 'https://github.com/apps/usually-frustrated/installations/new';

export class NotSignedInError extends Error {
  constructor() {
    super('Not logged in.');
    this.name = 'NotSignedInError';
  }
}

export interface Account {
  login: string;
  type: string;
}

export interface Me {
  login: string;
  accounts: Account[];
}

export interface IssuedToken {
  token: string;
  expires_at: string | null;
}

export function loginUrl(returnTo: string): string {
  return `${AUTH_ORIGIN}/login?return_to=${encodeURIComponent(returnTo)}`;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await globalThis.fetch(`${AUTH_ORIGIN}${path}`, { ...init, credentials: 'include', cache: 'no-store' });
  if (res.status === 401) throw new NotSignedInError();
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`);
  return body as T;
}

export function fetchMe(): Promise<Me> {
  return call<Me>('/me');
}

export function fetchToken(target: string): Promise<IssuedToken> {
  return call<IssuedToken>('/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target }),
  });
}

export async function logOut(): Promise<void> {
  await call('/logout', { method: 'POST' });
}
