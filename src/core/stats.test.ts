import { describe, expect, it } from 'vitest';
import { lifecycle, pct, queueSegments, summarize, summarizeRuns, weekKey } from './stats';
import type { Run } from './types';

const run = (created: number, updated: number, conclusion: string | null): Run => ({
  workflowId: 1,
  created,
  updated,
  started: created,
  conclusion,
  pr: 1,
});
const shape = (stages: { t0: number; t1: number; kind: string }[]) =>
  stages.map((s) => [s.kind, s.t0, s.t1]);

describe('lifecycle', () => {
  it('splits an attempt into wait, run and after-run stages', () => {
    expect(
      shape(lifecycle({ start: 0, end: 100 }, [run(40, 70, 'success'), run(10, 30, 'failure')], 999)),
    ).toEqual([
      ['wait', 0, 10],
      ['failed', 10, 30],
      ['after-failed', 30, 40],
      ['passed', 40, 70],
      ['after-passed', 70, 100],
    ]);
  });

  it('clips a run that outlives the attempt', () => {
    expect(shape(lifecycle({ start: 0, end: 50 }, [run(10, 200, 'failure')], 999))).toEqual([
      ['wait', 0, 10],
      ['failed', 10, 50],
    ]);
  });

  it('ignores runs created outside the attempt and uses now for an open attempt', () => {
    expect(shape(lifecycle({ start: 10, end: null }, [run(5, 8, 'success'), run(20, 20, null)], 40))).toEqual([
      ['wait', 10, 20],
      ['running', 20, 40],
    ]);
  });

  it('ends a run at the start of the next one and treats other conclusions as cancelled', () => {
    expect(shape(lifecycle({ start: 0, end: 30 }, [run(0, 20, 'cancelled'), run(10, 20, 'success')], 99))).toEqual([
      ['cancelled', 0, 10],
      ['passed', 10, 20],
      ['after-passed', 20, 30],
    ]);
  });
});

describe('queueSegments', () => {
  it('moves a later attempt up when the head of the queue leaves', () => {
    expect(
      queueSegments(
        [
          { start: 0, end: 10 },
          { start: 5, end: 20 },
        ],
        99,
      ),
    ).toEqual([
      { i: 0, pos: 0, t0: 0, t1: 10 },
      { i: 1, pos: 1, t0: 5, t1: 10 },
      { i: 1, pos: 0, t0: 10, t1: 20 },
    ]);
  });

  it('keeps the head in place when a later attempt leaves and closes open attempts at now', () => {
    expect(
      queueSegments(
        [
          { start: 0, end: null },
          { start: 5, end: 8 },
        ],
        20,
      ),
    ).toEqual([
      { i: 1, pos: 1, t0: 5, t1: 8 },
      { i: 0, pos: 0, t0: 0, t1: 20 },
    ]);
  });
});

describe('summaries', () => {
  it('computes percentiles and week keys', () => {
    expect(pct([], 50)).toBeNull();
    expect(pct([3, 1, 2], 50)).toBe(2);
    expect(pct([3, 1, 2], 100)).toBe(3);
    expect(weekKey(Date.parse('2026-06-10T12:00:00Z'))).toBe('2026-06-08');
  });

  it('summarizes attempts', () => {
    const s = summarize([
      { pr: 1, start: 0, end: 60e3, outcome: 'merged' },
      { pr: 2, start: 0, end: 60e3, outcome: 'failed_checks' },
      { pr: 3, start: 0, end: null, outcome: 'queued' },
    ]);
    expect(s).toMatchObject({ attempts: 3, merged: 1, notMerged: 1, rate: 50, p50: 1 });
  });

  it('summarizes runs and leaves out unfinished ones', () => {
    expect(summarizeRuns([run(0, 120e3, 'success'), run(0, 1, 'failure'), run(0, 1, null)])).toEqual({
      runs: 2,
      failed: 1,
      failRate: 50,
      okP50: 2,
    });
  });
});
