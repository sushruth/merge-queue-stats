import { describe, expect, it } from 'vitest';
import type { PrRow } from './derive';
import type { Attempt } from './types';
import {
  AXIS,
  clampView,
  fitAll,
  frameRange,
  hitTest,
  matchesRange,
  panBy,
  rebase,
  rowSpan,
  timeAt,
  xOf,
  yOfRow,
  zoomAt,
  type Extent,
  type View,
} from './view';

const HOUR = 36e5;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 5, 15);
const SIZE = { width: 1000, height: 524 };
const extent: Extent = { tMin: NOW - 42 * DAY, tMax: NOW, rows: 100 };
const base: View = { ...SIZE, t0: NOW - 7 * DAY, pxPerMs: 1000 / (7 * DAY), y0: 10, rowPx: 10 };

const attempt = (start: number, end: number | null, outcome = 'merged') =>
  ({ pr: 1, start, end, outcome }) as Attempt;

function row(attempts: Attempt[]): PrRow {
  return { pr: 1, start: attempts[0]!.start, attempts, shown: attempts, stages: attempts.map(() => []) };
}

describe('zoomAt', () => {
  it('keeps the time and row under the pointer in place', () => {
    const next = zoomAt(base, 2, 400, 200, extent);
    expect(timeAt(next, 400)).toBeCloseTo(timeAt(base, 400), 3);
    expect(next.y0 + (200 - AXIS) / next.rowPx).toBeCloseTo(base.y0 + (200 - AXIS) / base.rowPx, 6);
    expect(next.pxPerMs).toBeCloseTo(base.pxPerMs * 2);
    expect(next.rowPx).toBe(20);
  });

  it('stops zooming out where the whole graph fits', () => {
    const out = zoomAt(base, 1e-6, 0, AXIS, extent);
    expect(out.rowPx).toBe(5);
    expect(out.pxPerMs).toBeCloseTo(SIZE.width / (42 * DAY));
    expect(out).toEqual(fitAll(SIZE, extent));
    expect(zoomAt(base, 1e6, 0, AXIS, extent).rowPx).toBe(40);
  });

  it('does not move the view when zooming out at the limit', () => {
    const fitted = fitAll(SIZE, extent);
    expect(zoomAt(fitted, 0.5, 700, 300, extent)).toEqual(fitted);
  });

  it('lets rows go below the floor when that is what fits everything', () => {
    const big = { ...extent, rows: 900 };
    expect(zoomAt(base, 1e-6, 0, AXIS, big).rowPx).toBeCloseTo((SIZE.height - AXIS) / 900);
  });
});

describe('clampView', () => {
  const edges = (v: View) => ({ end: v.t0 + v.width / v.pxPerMs, bottom: v.y0 + (v.height - AXIS) / v.rowPx });

  it('stops panning at the first event and the first row', () => {
    const v = panBy(base, 1e7, 1e7, extent);
    expect(v.t0).toBe(extent.tMin);
    expect(v.y0).toBe(0);
  });

  it('stops panning at now and the last row', () => {
    const v = panBy(base, -1e7, -1e7, extent);
    expect(edges(v).end).toBeCloseTo(extent.tMax, 3);
    expect(edges(v).bottom).toBeCloseTo(extent.rows);
  });

  it('pins an axis to its start when the data is smaller than the viewport', () => {
    const few = { tMin: NOW - 30 * 60e3, tMax: NOW, rows: 3 };
    const v = fitAll(SIZE, few);
    expect(v.rowPx).toBe(14);
    for (const moved of [panBy(v, 500, 500, few), panBy(v, -500, -500, few), zoomAt(v, 0.5, 300, 300, few)]) {
      expect(moved.t0).toBe(few.tMin);
      expect(moved.y0).toBe(0);
    }
  });

  it('zooms in when a wider or taller frame would show past the graph', () => {
    const fitted = fitAll(SIZE, extent);
    const v = clampView({ ...fitted, width: 2000, height: 1024 }, extent);
    expect(v).toEqual(fitAll({ width: 2000, height: 1024 }, extent));
  });

  it('pulls the view back when a larger frame reaches past the end', () => {
    const atEnd = panBy(base, -1e7, -1e7, extent);
    const v = clampView({ ...atEnd, width: 1500, height: 824 }, extent);
    expect(edges(v).end).toBeCloseTo(extent.tMax, 3);
    expect(edges(v).bottom).toBeCloseTo(extent.rows);
  });

  it('leaves a view inside the limits alone', () => {
    expect(clampView(base, extent)).toEqual(base);
  });
});

describe('hitTest', () => {
  const rows = [row([attempt(NOW - 6 * DAY, NOW - 5 * DAY, 'failed_checks'), attempt(NOW - 3 * DAY, NOW - 2 * DAY)])];
  const view: View = { ...base, y0: 0 };
  const y = AXIS + 5;

  it('finds an attempt', () => {
    const hit = hitTest(view, rows, xOf(view, NOW - 5.5 * DAY), y, NOW);
    expect(hit?.part).toEqual({ attempt: rows[0]!.attempts[0] });
  });

  it('finds the gap between attempts', () => {
    const hit = hitTest(view, rows, xOf(view, NOW - 4 * DAY), y, NOW);
    expect(hit?.part).toEqual({ gapBefore: rows[0]!.attempts[1] });
  });

  it('misses outside the row, the attempts, and over the axis', () => {
    expect(hitTest(view, rows, xOf(view, NOW - DAY), y, NOW)).toBeNull();
    expect(hitTest(view, rows, xOf(view, NOW - 5.5 * DAY), AXIS + 15, NOW)).toBeNull();
    expect(hitTest(view, rows, xOf(view, NOW - 5.5 * DAY), 5, NOW)).toBeNull();
  });
});

describe('framing', () => {
  const range = { from: NOW - 7 * DAY, to: NOW };

  it('puts the range edge to edge and matches it', () => {
    const v = frameRange(SIZE, range, { top: 0, count: 50 }, extent);
    expect(xOf(v, range.from)).toBeCloseTo(0);
    expect(xOf(v, range.to)).toBeCloseTo(SIZE.width);
    expect(v.rowPx).toBe(10);
    expect(matchesRange(v, range)).toBe(true);
  });

  it('stops matching after a pan or zoom', () => {
    const v = frameRange(SIZE, range, { top: 0, count: 50 }, extent);
    expect(matchesRange(panBy(v, 20, 0, extent), range)).toBe(false);
    expect(matchesRange(zoomAt(v, 1.2, 100, 100, extent), range)).toBe(false);
    expect(matchesRange(v, { from: NOW - 14 * DAY, to: NOW })).toBe(false);
  });

  it('still matches after a vertical pan', () => {
    const v = frameRange(SIZE, range, { top: 0, count: 50 }, extent);
    expect(matchesRange(panBy(v, 0, -30, extent), range)).toBe(true);
  });

  it('fits everything on fit-all', () => {
    const v = fitAll(SIZE, { ...extent, rows: 900 });
    expect(yOfRow(v, 900)).toBeCloseTo(SIZE.height);
    expect(xOf(v, extent.tMax)).toBeCloseTo(SIZE.width);
  });

  it('finds the rows of a range', () => {
    const rows = [
      row([attempt(NOW - DAY, null)]),
      row([attempt(NOW - 6 * DAY, NOW - 5 * DAY)]),
      row([attempt(NOW - 20 * DAY, NOW - 19 * DAY)]),
      row([attempt(NOW - 30 * DAY, NOW - 29 * DAY), attempt(NOW - 2 * DAY, NOW - DAY)]),
    ];
    expect(rowSpan(rows, range, NOW)).toEqual({ top: 0, count: 2 });
    expect(rowSpan(rows, { from: NOW - 40 * DAY, to: NOW - 35 * DAY }, NOW)).toBeNull();
  });
});

describe('rebase', () => {
  it('stays on the newest edge and at the top when already there', () => {
    const v = frameRange(SIZE, { from: NOW - 7 * DAY, to: NOW }, { top: 0, count: 50 }, extent);
    const later = NOW + HOUR;
    const next = rebase(v, { rows: 100, now: NOW }, { ...extent, tMax: later, rows: 103 });
    expect(matchesRange(next, { from: later - 7 * DAY, to: later })).toBe(true);
    expect(next.y0).toBe(0);
  });

  it('keeps the same rows and time in view elsewhere', () => {
    const v = { ...base, t0: NOW - 20 * DAY };
    const next = rebase(v, { rows: 100, now: NOW }, { ...extent, tMax: NOW + HOUR, rows: 103 });
    expect(next.t0).toBe(v.t0);
    expect(next.y0).toBe(v.y0 + 3);
  });
});
