import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flatten, syncAttempts, toAttempts } from './attempts';
import { createClient } from './github';
import type { AttemptsCache } from './types';

const repo = { owner: 'acme', name: 'widgets' };
const NOW = Date.parse('2026-06-01T00:00:00Z');
const iso = (t: number) => new Date(t).toISOString();

describe('toAttempts', () => {
  it('counts a merged removal followed by a MergedEvent 2 seconds later as one attempt', () => {
    expect(
      toAttempts([
        { type: 'added', at: 100 },
        { type: 'removed', at: 200, reason: 'merged' },
        { type: 'merged', at: 2200 },
      ]),
    ).toEqual([[100, 200, 'merged']]);
  });

  it('closes the open attempt as re_added when a re-add has no removal event', () => {
    expect(
      toAttempts([
        { type: 'added', at: 1 },
        { type: 'added', at: 5 },
        { type: 'removed', at: 9, reason: 'failed_checks' },
      ]),
    ).toEqual([
      [1, 5, 're_added'],
      [5, 9, 'failed_checks'],
    ]);
  });

  it('sorts events, keeps an open attempt as queued and falls back to unknown', () => {
    expect(
      toAttempts([
        { type: 'added', at: 30 },
        { type: 'removed', at: 20 },
        { type: 'added', at: 10 },
      ]),
    ).toEqual([
      [10, 20, 'unknown'],
      [30, null, 'queued'],
    ]);
  });
});

describe('flatten', () => {
  it('drops attempts before the window and open attempts missing from the live queue', () => {
    const st: AttemptsCache = {
      since: 100,
      prs: { 1: [[50, 60, 'merged'], [150, 160, 'merged']], 2: [[200, null, 'queued']], 3: [[300, null, 'queued']] },
    };
    expect(flatten(st, new Set([3])).map((a) => a.pr)).toEqual([1, 3]);
    expect(flatten(st).length).toBe(3);
  });
});

function prPage(nodes: { number: number; updatedAt: number }[], endCursor: string, hasNextPage: boolean) {
  return {
    data: {
      repository: {
        pullRequests: {
          pageInfo: { hasNextPage, endCursor },
          nodes: nodes.map((n) => ({
            number: n.number,
            updatedAt: iso(n.updatedAt),
            timelineItems: {
              nodes: [{ __typename: 'AddedToMergeQueueEvent', createdAt: iso(n.updatedAt - 1000) }],
            },
          })),
        },
      },
    },
  };
}

function stubFetch(responses: unknown[]) {
  const afters: (string | null)[] = [];
  let i = 0;
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    afters.push(JSON.parse(String(init?.body)).variables.after);
    const body = responses[i++];
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return { fetch, afters, api: createClient({ token: 't', fetch: fetch as unknown as typeof globalThis.fetch }) };
}

describe('syncAttempts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves the cursor when a backfill is interrupted and resumes from it', async () => {
    const st: AttemptsCache = { prs: {} };
    const first = stubFetch([prPage([{ number: 1, updatedAt: NOW - 1000 }], 'c1', true), new Error('boom')]);
    await expect(syncAttempts(first.api, repo, st)).rejects.toThrow('boom');
    expect(st.cursor).toBe('c1');
    expect(st.backfillDone).toBeUndefined();
    const startedAt = st.backfillStartedAt;

    vi.setSystemTime(NOW + 60e3);
    const second = stubFetch([
      prPage(
        [
          { number: 2, updatedAt: NOW - 2000 },
          { number: 3, updatedAt: st.since! - 1 },
        ],
        'c2',
        true,
      ),
    ]);
    await syncAttempts(second.api, repo, st);
    expect(second.afters).toEqual(['c1']);
    expect(st.backfillDone).toBe(true);
    expect(st.watermark).toBe(startedAt);
    expect(st.cursor).toBeUndefined();
    expect(Object.keys(st.prs)).toEqual(['1', '2']);
  });

  it('stops an incremental sync at watermark minus five minutes', async () => {
    const watermark = NOW - 3600e3;
    const st: AttemptsCache = { prs: {}, since: NOW - 864e5, backfillDone: true, watermark };
    const { api, afters, fetch } = stubFetch([
      prPage(
        [
          { number: 1, updatedAt: watermark + 1000 },
          { number: 2, updatedAt: watermark - 4 * 60e3 },
          { number: 3, updatedAt: watermark - 6 * 60e3 },
          { number: 4, updatedAt: watermark - 7 * 60e3 },
        ],
        'next',
        true,
      ),
    ]);
    await syncAttempts(api, repo, st);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(afters).toEqual([null]);
    expect(Object.keys(st.prs)).toEqual(['1', '2']);
    expect(st.watermark).toBe(NOW);
  });
});
