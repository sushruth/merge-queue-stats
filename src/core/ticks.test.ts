import { describe, expect, it } from 'vitest';
import { axisTicks } from './ticks';
import type { Extent, View } from './view';

const HOUR = 36e5;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 5, 15);
const extent: Extent = { tMin: NOW - 42 * DAY, tMax: NOW, rows: 100 };
const base: View = { width: 1000, height: 524, t0: NOW - 7 * DAY, pxPerMs: 1000 / (7 * DAY), y0: 10, rowPx: 10 };

describe('axisTicks', () => {
  it('moves from weeks to hours with zoom', () => {
    const wide: View = { ...base, t0: extent.tMin, pxPerMs: 1000 / (42 * DAY) };
    const close: View = { ...base, pxPerMs: 200 / HOUR };
    expect(axisTicks(wide)[1]!.t - axisTicks(wide)[0]!.t).toBe(7 * DAY);
    expect(new Date(axisTicks(wide)[0]!.t).getUTCDay()).toBe(1);
    expect(axisTicks(close)[1]!.t - axisTicks(close)[0]!.t).toBe(HOUR);
  });
});
