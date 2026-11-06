import { describe, expect, it } from 'vitest';
import { columnStacks, rowStacks } from './histogram';
import type { RowShape } from './rowShape';
import { AXIS, type View } from './view';

const v: View = { t0: 0, pxPerMs: 1, y0: 0, rowPx: 10, width: 100, height: AXIS + 20 };
const row = (...pieces: [RowShape['pieces'][number]['key'], number, number][]): RowShape => ({
  pieces: pieces.map(([key, t0, t1]) => ({ key, t0, t1 })),
  caps: [],
});

describe('histograms follow the screen', () => {
  it('stacks each column by stage', () => {
    const { counts, peak } = columnStacks([row(['wait', 0, 50]), row(['passed', 40, 60])], v);
    expect([counts.wait[10], counts.passed[10]]).toEqual([1, 0]);
    expect([counts.wait[45], counts.passed[45]]).toEqual([1, 1]);
    expect(counts.wait[55]).toBe(0);
    expect(peak).toBe(2);
  });

  it('leaves time out of the queue out of the queue peak', () => {
    const { peak, queuePeak } = columnStacks([row(['gap', 0, 50]), row(['wait', 0, 50])], v);
    expect([peak, queuePeak]).toEqual([2, 1]);
  });

  it('closes gaps in the row bars', () => {
    const { stacks } = rowStacks([row(['wait', 0, 10], ['gap', 10, 60], ['passed', 60, 70])], v);
    expect(stacks[0]!.parts).toEqual([{ key: 'wait', ms: 10 }, { key: 'passed', ms: 10 }]);
    expect(stacks[0]!.total).toBe(20);
  });

  it('counts a row once in a column two short pieces share', () => {
    const { peak } = columnStacks([row(['wait', 10, 10.2], ['passed', 10.2, 10.4])], v);
    expect(peak).toBe(1);
  });

  it('bottom follows only the time bounds', () => {
    const shapes = [row(['wait', 0, 10]), row(['wait', 0, 10]), row(['wait', 0, 10])];
    const scrolledAway = { ...v, y0: 2 };
    expect(columnStacks(shapes, scrolledAway).peak).toBe(3);
    expect(columnStacks([row(['wait', 200, 300])], v).peak).toBe(0);
  });

  it('right follows only the row bounds', () => {
    const shapes = [row(['wait', -50, 30]), row(['wait', 500, 510]), row(['wait', 0, 90])];
    const { stacks, peak } = rowStacks(shapes, v);
    expect(stacks.map((s) => s.total)).toEqual([80, 10]);
    expect(peak).toBe(80);
  });
});
