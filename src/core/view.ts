import { CAP } from './rowShape';
import { partAt, type PrRow, type Range } from './derive';

export const AXIS = 24;
export const FRAMED_ROW = 14;
const MAX_ROW = 40;
const HOUR = 36e5;
const MAX_PX_PER_MS = 1200 / HOUR;
const MATCH_PX = 2;
const EDGE = 4;

export interface View {
  t0: number;
  pxPerMs: number;
  y0: number;
  rowPx: number;
  width: number;
  height: number;
}

export interface Extent {
  tMin: number;
  tMax: number;
  rows: number;
}

export function extentOf(rows: PrRow[], now: number): Extent {
  let tMin = now;
  for (const r of rows) tMin = Math.min(tMin, r.attempts[0]!.start);
  return { tMin, tMax: now, rows: rows.length };
}

export const plotHeight = (v: Pick<View, 'height'>): number => Math.max(1, v.height - AXIS);
const plotWidth = (v: Pick<View, 'width'>): number => Math.max(1, v.width);
export const between = (value: number, a: number, b: number): number =>
  Math.min(Math.max(value, Math.min(a, b)), Math.max(a, b));

export const xOf = (v: View, t: number): number => (t - v.t0) * v.pxPerMs;
export const timeAt = (v: View, px: number): number => v.t0 + px / v.pxPerMs;
export const yOfRow = (v: View, row: number): number => AXIS + (row - v.y0) * v.rowPx;
export const rowAt = (v: View, py: number): number =>
  py < AXIS ? -1 : Math.floor(v.y0 + (py - AXIS) / v.rowPx);

function fitZoom(size: Pick<View, 'width' | 'height'>, e: Extent): Pick<View, 'pxPerMs' | 'rowPx'> {
  return {
    pxPerMs: Math.min(plotWidth(size) / Math.max(1, e.tMax - e.tMin), MAX_PX_PER_MS),
    rowPx: Math.min(FRAMED_ROW, plotHeight(size) / Math.max(1, e.rows)),
  };
}

export function clampView(v: View, e: Extent): View {
  const fit = fitZoom(v, e);
  const pxPerMs = Math.max(v.pxPerMs, fit.pxPerMs);
  const rowPx = Math.max(v.rowPx, fit.rowPx);
  return {
    ...v,
    pxPerMs,
    rowPx,
    t0: between(v.t0, e.tMin, Math.max(e.tMin, e.tMax - plotWidth(v) / pxPerMs)),
    y0: between(v.y0, 0, Math.max(0, e.rows - plotHeight(v) / rowPx)),
  };
}

export const panBy = (v: View, dx: number, dy: number, e: Extent): View =>
  clampView({ ...v, t0: v.t0 - dx / v.pxPerMs, y0: v.y0 - dy / v.rowPx }, e);

export function zoomAt(v: View, factor: number, px: number, py: number, e: Extent): View {
  const fit = fitZoom(v, e);
  const pxPerMs = between(v.pxPerMs * factor, fit.pxPerMs, MAX_PX_PER_MS);
  const rowPx = between(v.rowPx * factor, fit.rowPx, MAX_ROW);
  if (pxPerMs === v.pxPerMs && rowPx === v.rowPx) return clampView(v, e);
  const down = py - AXIS;
  return clampView(
    {
      ...v,
      pxPerMs,
      rowPx,
      t0: timeAt(v, px) - px / pxPerMs,
      y0: v.y0 + down / v.rowPx - down / rowPx,
    },
    e,
  );
}

export function fitAll(size: Pick<View, 'width' | 'height'>, e: Extent): View {
  return clampView({ ...size, ...fitZoom(size, e), t0: e.tMin, y0: 0 }, e);
}

export function rowSpan(rows: PrRow[], { from, to }: Range, now: number): { top: number; count: number } | null {
  let top = -1;
  let lastOverlap = -1;
  let lastStarted = -1;
  rows.forEach((row, i) => {
    if (!row.attempts.some((a) => a.start < to && (a.end ?? now) > from)) return;
    if (top < 0) top = i;
    lastOverlap = i;
    if (row.start >= from) lastStarted = i;
  });
  if (top < 0) return null;
  return { top, count: (lastStarted >= 0 ? lastStarted : lastOverlap) - top + 1 };
}

export function frameRange(
  size: Pick<View, 'width' | 'height'>,
  range: Range,
  span: { top: number; count: number } | null,
  e: Extent,
): View {
  const rows = span?.count ?? Math.max(1, e.rows);
  return clampView(
    {
      ...size,
      t0: range.from,
      pxPerMs: plotWidth(size) / Math.max(1, range.to - range.from),
      y0: span?.top ?? 0,
      rowPx: Math.min(plotHeight(size) / rows, FRAMED_ROW),
    },
    e,
  );
}

export function matchesRange(v: View, { from, to }: Range): boolean {
  return (
    Math.abs(xOf(v, from)) <= MATCH_PX && Math.abs(xOf(v, to) - plotWidth(v)) <= MATCH_PX
  );
}

export function rebase(v: View, prev: { rows: number; now: number }, next: Extent): View {
  const atRight = Math.abs(xOf(v, prev.now) - plotWidth(v)) <= MATCH_PX;
  const atTop = v.y0 * v.rowPx < EDGE;
  return clampView(
    {
      ...v,
      t0: atRight ? v.t0 + next.tMax - prev.now : v.t0,
      y0: atTop ? v.y0 : v.y0 + next.rows - prev.rows,
    },
    next,
  );
}

export function hitTest(v: View, rows: PrRow[], px: number, py: number, now: number) {
  const row = rows[rowAt(v, py)];
  if (!row) return null;
  const part = partAt(row, timeAt(v, px), CAP / v.pxPerMs, now);
  return part ? { row, part } : null;
}
