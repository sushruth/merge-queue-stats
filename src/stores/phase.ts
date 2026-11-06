import { useAuth } from './auth';
import { useData } from './data';
import { useSettings } from './settings';

export type Phase =
  | 'needs_repo'
  | 'needs_token'
  | 'auth_error'
  | 'rate_limited'
  | 'repo_not_found'
  | 'empty_repo'
  | 'no_queue'
  | 'loading'
  | 'ready';

export function usePhase(): Phase {
  const repo = useSettings((s) => s.repo);
  const branch = useSettings((s) => s.branch);
  const hasToken = useAuth((s) => s.token !== null);
  const authError = useData((s) => s.authError);
  const rateLimited = useData((s) => s.rateLimitedUntil !== null);
  const queueState = useData((s) => s.queueState);
  if (!repo) return 'needs_repo';
  if (!hasToken) return 'needs_token';
  if (authError) return 'auth_error';
  if (rateLimited) return 'rate_limited';
  if (queueState === 'repo_not_found' || queueState === 'empty_repo' || queueState === 'no_queue') {
    return queueState;
  }
  if (!branch || queueState === 'unknown') return 'loading';
  return 'ready';
}
