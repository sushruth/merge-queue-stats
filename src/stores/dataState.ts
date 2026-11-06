import type { RateInfo } from '../core/github';
import type { WriteResult } from '../core/storage';
import type { AttemptsCache, LiveEntry, RunsCache } from '../core/types';

export type QueueState = 'unknown' | 'ready' | 'no_queue' | 'repo_not_found' | 'empty_repo';

export type SyncProgress =
  | { phase: 'attempts'; oldest: number | null; backfilling: boolean }
  | { phase: 'runs'; day: string };

export interface LiveCache {
  live: LiveEntry[] | null;
  liveAt: number | null;
}

export interface DataState {
  attempts: AttemptsCache;
  runs: RunsCache;
  live: LiveEntry[] | null;
  liveAt: number | null;
  lastSyncAt: number | null;
  queueState: QueueState;
  progress: SyncProgress | null;
  authError: boolean;
  rateInfo: Partial<Record<RateInfo['bucket'], RateInfo>>;
  rateLimitedUntil: number | null;
  storageError: Exclude<WriteResult, 'ok'> | null;
  liveError: string | null;
  historyError: string | null;
  connect(repo: string | null, branch: string | null, token: string | null): void;
  refreshLive(): Promise<void>;
  refreshHistory(): Promise<void>;
}
