import { create } from 'zustand';
import { syncAttempts } from '../core/attempts';
import { AuthError, NotFoundError, RateLimitError } from '../core/github';
import { fetchDefaultBranch, fetchLive } from '../core/live';
import { syncRuns } from '../core/runs';
import { cacheKey, readJson, writeJson, type CacheKind } from '../core/storage';
import type { DataState, LiveCache } from './dataState';
import { emptyAttempts, emptyRuns, openSession, type Session } from './session';
import { useSettings } from './settings';

let session: Session | null = null;

export const useData = create<DataState>((set, get) => {
  const save = (s: Session, kind: CacheKind, value: unknown): void => {
    if (!s.repoName || !s.branch) return;
    const result = writeJson(cacheKey(kind, s.repoName, s.branch), value);
    if (s === session) set({ storageError: result === 'ok' ? null : result });
  };

  const publishAttempts = (s: Session): void => {
    save(s, 'attempts', s.attempts);
    if (s === session) set({ attempts: { ...s.attempts, prs: { ...s.attempts.prs } } });
  };

  const publishRuns = (s: Session): void => {
    save(s, 'runs', s.runs);
    if (s === session) set({ runs: { ...s.runs, days: { ...s.runs.days } } });
  };

  const handleError = (s: Session, e: unknown, field: 'liveError' | 'historyError'): void => {
    if (s !== session) return;
    if (e instanceof AuthError) set({ authError: true });
    else if (e instanceof RateLimitError) set({ rateLimitedUntil: e.resetAt });
    else if (e instanceof NotFoundError) set({ queueState: 'repo_not_found' });
    else set({ [field]: e instanceof Error ? e.message : 'Request failed.' });
  };

  const canFetch = (s: Session): boolean => {
    const { authError, queueState, rateLimitedUntil } = get();
    if (s !== session || !s.api || !s.repo || authError) return false;
    if (queueState === 'repo_not_found' || queueState === 'empty_repo') return false;
    if (rateLimitedUntil !== null) {
      if (Date.now() < rateLimitedUntil) return false;
      set({ rateLimitedUntil: null });
    }
    return true;
  };

  const runLive = async (s: Session): Promise<void> => {
    try {
      if (!s.branch) {
        const branch = await fetchDefaultBranch(s.api!, s.repo!);
        if (s !== session) return;
        if (branch) useSettings.getState().setBranch(branch);
        else set({ queueState: 'empty_repo' });
        return;
      }
      const live = await fetchLive(s.api!, s.repo!, s.branch);
      if (s !== session) return;
      const liveAt = Date.now();
      save(s, 'live', { live, liveAt } satisfies LiveCache);
      set({ live, liveAt, queueState: live ? 'ready' : 'no_queue', liveError: null });
    } catch (e) {
      handleError(s, e, 'liveError');
    }
  };

  const runHistory = async (s: Session): Promise<void> => {
    try {
      if (!s.branch) return;
      if (get().queueState === 'unknown') await get().refreshLive();
      if (s !== session || !canFetch(s) || get().queueState !== 'ready') return;
      await syncAttempts(s.api!, s.repo!, s.attempts, (oldest, backfilling) => {
        if (s === session) set({ progress: { phase: 'attempts', oldest, backfilling } });
        publishAttempts(s);
      });
      publishAttempts(s);
      await syncRuns(s.api!, s.repo!, s.branch, s.runs, s.attempts.since!, (day) => {
        if (s === session) set({ progress: { phase: 'runs', day } });
        publishRuns(s);
      });
      publishRuns(s);
      if (s === session) set({ lastSyncAt: Date.now(), historyError: null });
    } catch (e) {
      handleError(s, e, 'historyError');
    } finally {
      if (s === session) set({ progress: null });
    }
  };

  return {
    attempts: emptyAttempts(),
    runs: emptyRuns(),
    live: null,
    liveAt: null,
    lastSyncAt: null,
    queueState: 'unknown',
    progress: null,
    authError: false,
    rateInfo: {},
    rateLimitedUntil: null,
    storageError: null,
    liveError: null,
    historyError: null,

    connect(repoName, branch, token) {
      const previous = session;
      previous?.abort.abort();
      const sameCache =
        previous !== null &&
        previous.repoName?.toLowerCase() === repoName?.toLowerCase() &&
        previous.branch === branch;
      const next = openSession(repoName, branch, token, sameCache ? previous : null, (s, info) => {
        if (session === s) set((st) => ({ rateInfo: { ...st.rateInfo, [info.bucket]: info } }));
      });
      session = next;

      const common = {
        queueState: 'unknown' as const,
        authError: false,
        rateLimitedUntil: null,
        liveError: null,
        historyError: null,
        progress: null,
      };
      if (sameCache) {
        set(common);
        return;
      }
      let live: LiveCache = { live: null, liveAt: null };
      if (repoName && branch) {
        next.attempts = readJson(cacheKey('attempts', repoName, branch), emptyAttempts());
        next.runs = readJson(cacheKey('runs', repoName, branch), emptyRuns());
        live = readJson(cacheKey('live', repoName, branch), live);
      }
      set({
        ...common,
        attempts: next.attempts,
        runs: next.runs,
        live: live.live,
        liveAt: live.liveAt,
        lastSyncAt: null,
        storageError: null,
      });
    },

    refreshLive() {
      const s = session;
      if (!s || !canFetch(s)) return Promise.resolve();
      s.liveTask ??= runLive(s).finally(() => {
        s.liveTask = undefined;
      });
      return s.liveTask;
    },

    refreshHistory() {
      const s = session;
      if (!s || !canFetch(s)) return Promise.resolve();
      s.historyTask ??= runHistory(s).finally(() => {
        s.historyTask = undefined;
      });
      return s.historyTask;
    },
  };
});
