export const LIVE_INTERVAL_MS = 60e3;
export const HISTORY_INTERVAL_MS = 5 * 60e3;

export interface PollerTasks {
  live: () => unknown;
  history: () => unknown;
}

export interface Poller {
  start(): void;
  stop(): void;
}

export function createPoller(tasks: PollerTasks): Poller {
  const isHidden = (): boolean => typeof document !== 'undefined' && document.hidden;
  const whenVisible = (task: () => unknown) => (): void => {
    if (!isHidden()) void task();
  };
  const live = whenVisible(tasks.live);
  const history = whenVisible(tasks.history);
  const both = (): void => {
    live();
    history();
  };
  let timers: ReturnType<typeof setInterval>[] | null = null;

  return {
    start() {
      if (timers) return;
      timers = [setInterval(live, LIVE_INTERVAL_MS), setInterval(history, HISTORY_INTERVAL_MS)];
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', both);
      both();
    },
    stop() {
      if (!timers) return;
      timers.forEach(clearInterval);
      timers = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', both);
    },
  };
}
