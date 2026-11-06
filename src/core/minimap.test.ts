import { describe, expect, it } from 'vitest';
import { centerFromMinimap, minimapBox } from './minimap';
import type { Extent, View } from './view';

const DAY = 24 * 36e5;
const NOW = Date.UTC(2026, 5, 15);
const extent: Extent = { tMin: NOW - 42 * DAY, tMax: NOW, rows: 100 };
const base: View = { width: 1000, height: 524, t0: NOW - 7 * DAY, pxPerMs: 1000 / (7 * DAY), y0: 10, rowPx: 10 };

describe('minimap', () => {
  it('jumps so the view centres on the clicked point', () => {
    const v = centerFromMinimap(base, extent, 88, 44, 176, 88);
    const box = minimapBox(v, extent, 176, 88);
    expect(box.x + box.w / 2).toBeCloseTo(88);
    expect(box.y + box.h / 2).toBeCloseTo(44);
  });

  it('cannot leave the graph from a corner of the minimap', () => {
    const atStart = centerFromMinimap(base, extent, 0, 0, 176, 88);
    expect(atStart.t0).toBe(extent.tMin);
    expect(atStart.y0).toBe(0);
    const atEnd = centerFromMinimap(base, extent, 176, 88, 176, 88);
    expect(atEnd.t0 + atEnd.width / atEnd.pxPerMs).toBeCloseTo(extent.tMax, 3);
    expect(atEnd.y0 + (atEnd.height - 24) / atEnd.rowPx).toBeCloseTo(extent.rows);
  });
});
