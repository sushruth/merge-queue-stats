import { describe, expect, it } from 'vitest';
import { dayRows, partAt, prRows, rangeSummary, resolveRange, weeklyRows } from './derive';
import type { Attempt } from './types';

const H = 36e5;
const T = Date.parse('2026-06-10T00:00:00Z');
const a = (pr: number, start: number, end: number | null, outcome = 'merged'): Attempt => ({
  pr,
  start: T + start * H,
  end: end === null ? null : T + end * H,
  outcome,
});

describe('prRows', () => {
  it('gives every PR one row, newest first, with all attempts on it', () => {
    const list = [a(1, 0, 1, 'failed_checks'), a(2, 2, 3), a(1, 4, 5)];
    const rows = prRows(list, new Map(), { from: T, to: T + 10 * H }, T + 10 * H);
    expect(rows.map((r) => r.pr)).toEqual([2, 1]);
    expect(rows[1]!.shown).toHaveLength(2);
  });

  it('keeps out-of-range attempts for the tooltip but not the row position', () => {
    const list = [a(1, -50, -49, 'failed_checks'), a(1, 4, 5)];
    const [row] = prRows(list, new Map(), { from: T, to: T + 10 * H }, T + 10 * H);
    expect(row!.attempts).toHaveLength(2);
    expect(row!.shown).toHaveLength(1);
    expect(row!.start).toBe(T + 4 * H);
  });
});

describe('partAt', () => {
  const [row] = prRows([a(1, 0, 1, 'dequeued'), a(1, 4, 5)], new Map(), { from: T, to: T + 9 * H }, T + 9 * H);

  it('finds an attempt, the gap between attempts, and nothing outside the span', () => {
    expect(partAt(row!, T + 4.5 * H, 0, T + 9 * H)).toEqual({ attempt: row!.attempts[1] });
    expect(partAt(row!, T + 2 * H, 0, T + 9 * H)).toEqual({ gapBefore: row!.attempts[1] });
    expect(partAt(row!, T + 8 * H, 0, T + 9 * H)).toBeNull();
  });
});

describe('summaries', () => {
  it('fills empty days and groups weeks starting Monday UTC', () => {
    const list = [a(1, 0, 1), a(2, 49, 50, 'failed_checks')];
    expect(dayRows(list, T + 50 * H).map((d) => d.total)).toEqual([1, 0, 1]);
    expect(weeklyRows(list, []).map((w) => w.week)).toEqual(['2026-06-08']);
  });

  it('reports the peak in queue for the range', () => {
    const list = [a(1, 0, 4), a(2, 1, 3), a(3, 20, 21)];
    expect(rangeSummary(list, { from: T, to: T + 10 * H }, T + 30 * H).peak).toBe(2);
  });

  it('resolves presets and inclusive custom dates', () => {
    expect(resolveRange(7, null, null, T)).toEqual({ from: T - 7 * 864e5, to: T });
    expect(resolveRange(7, '2026-06-01', '2026-06-02', T)).toEqual({
      from: Date.parse('2026-06-01'),
      to: Date.parse('2026-06-03'),
    });
  });
});
