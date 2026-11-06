export type WriteResult = 'ok' | 'quota' | 'unavailable';

export const SETTINGS_KEY = 'mqs:settings';

export type CacheKind = 'attempts' | 'runs' | 'live';

export function cacheKey(kind: CacheKind, repo: string, branch: string): string {
  return `mqs:v1:${kind}:${repo.toLowerCase()}:${branch}`;
}

export function readText(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeText(key: string, value: string): WriteResult {
  try {
    localStorage.setItem(key, value);
    return 'ok';
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' ? 'quota' : 'unavailable';
  }
}

export function writeJson(key: string, value: unknown): WriteResult {
  return writeText(key, JSON.stringify(value));
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    return;
  }
}

export function cachedRepos(): string[] {
  const prefix = 'mqs:v1:attempts:';
  try {
    const repos = Object.keys(localStorage)
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length).split(':')[0]!);
    return [...new Set(repos)];
  } catch {
    return [];
  }
}
