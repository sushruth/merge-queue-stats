import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPoller, HISTORY_INTERVAL_MS, LIVE_INTERVAL_MS } from './poller';

describe('createPoller', () => {
  const doc = Object.assign(new EventTarget(), { hidden: false });

  beforeEach(() => {
    vi.useFakeTimers();
    doc.hidden = false;
    vi.stubGlobal('document', doc);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('polls on its intervals, pauses while hidden, resumes on visibility and stops', () => {
    const live = vi.fn();
    const history = vi.fn();
    const poller = createPoller({ live, history });
    poller.start();
    expect([live.mock.calls.length, history.mock.calls.length]).toEqual([1, 1]);

    vi.advanceTimersByTime(HISTORY_INTERVAL_MS);
    expect([live.mock.calls.length, history.mock.calls.length]).toEqual([6, 2]);

    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(HISTORY_INTERVAL_MS);
    expect([live.mock.calls.length, history.mock.calls.length]).toEqual([6, 2]);

    doc.hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect([live.mock.calls.length, history.mock.calls.length]).toEqual([7, 3]);

    poller.stop();
    vi.advanceTimersByTime(LIVE_INTERVAL_MS * 10);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(live.mock.calls.length).toBe(7);
  });
});
