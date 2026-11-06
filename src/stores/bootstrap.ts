import { createPoller } from '../core/poller';
import { parseRepo } from '../core/repo';
import { useAuth } from './auth';
import { useData } from './data';
import { useSettings } from './settings';

export function startApp(): () => void {
  const data = useData.getState();
  const poller = createPoller({ live: data.refreshLive, history: data.refreshHistory });
  let last: [string | null, string | null, string | null] | null = null;

  const reconcile = (): void => {
    const { repo, branch } = useSettings.getState();
    useAuth.getState().selectOwner(parseRepo(repo)?.owner ?? null);
    const { token } = useAuth.getState();
    if (last && last[0] === repo && last[1] === branch && last[2] === token) return;
    last = [repo, branch, token];
    poller.stop();
    data.connect(repo, branch, token);
    if (repo && token) poller.start();
  };

  const unsubscribers = [useSettings.subscribe(reconcile), useAuth.subscribe(reconcile)];
  reconcile();

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    poller.stop();
    data.connect(null, null, null);
  };
}
