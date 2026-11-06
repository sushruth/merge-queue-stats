import { createClient, type GitHubClient, type RateInfo } from '../core/github';
import { parseRepo } from '../core/repo';
import type { AttemptsCache, RepoRef, RunsCache } from '../core/types';

export interface Session {
  repoName: string | null;
  branch: string | null;
  repo: RepoRef | null;
  attempts: AttemptsCache;
  runs: RunsCache;
  api: GitHubClient | null;
  abort: AbortController;
  liveTask?: Promise<void>;
  historyTask?: Promise<void>;
}

export const emptyAttempts = (): AttemptsCache => ({ prs: {} });
export const emptyRuns = (): RunsCache => ({ days: {}, workflows: {}, truncatedDays: [] });

export function openSession(
  repoName: string | null,
  branch: string | null,
  token: string | null,
  cached: { attempts: AttemptsCache; runs: RunsCache } | null,
  onRate: (s: Session, info: RateInfo) => void,
): Session {
  const abort = new AbortController();
  const next: Session = {
    repoName,
    branch,
    repo: parseRepo(repoName),
    abort,
    attempts: cached?.attempts ?? emptyAttempts(),
    runs: cached?.runs ?? emptyRuns(),
    api: token ? createClient({ token, signal: abort.signal, onRate: (info) => onRate(next, info) }) : null,
  };
  return next;
}
