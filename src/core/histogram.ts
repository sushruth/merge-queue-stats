import type { PrRow } from './derive';
import type { PieceKey, RowShape } from './rowShape';
import { AXIS, rowAt, timeAt, xOf, type View } from './view';

export const STACK_ORDER: PieceKey[] = ['wait', 'passed', 'failed', 'running', 'cancelled', 'after-passed', 'after-failed', 'gap'];

export function visibleRows(v: View, count: number): { first: number; last: number } {
  return { first: Math.max(0, rowAt(v, AXIS)), last: Math.min(count - 1, rowAt(v, v.height - 1)) };
}

export interface ColumnStacks {
  counts: Record<PieceKey, Int32Array>;
  peak: number;
  queuePeak: number;
}

export function columnStacks(shapes: RowShape[], v: View): ColumnStacks {
  const width = Math.max(1, Math.round(v.width));
  const counts = Object.fromEntries(STACK_ORDER.map((k) => [k, new Int32Array(width + 1)])) as ColumnStacks['counts'];
  for (const shape of shapes) {
    // A row paints one pixel per column, so two short pieces sharing a column count once.
    let painted = 0;
    for (const p of shape.pieces) {
      const left = Math.round(xOf(v, p.t0));
      const a = Math.max(left, painted, 0);
      const b = Math.min(left + Math.max(1, Math.round(xOf(v, p.t1)) - left), width);
      if (a >= b) continue;
      counts[p.key][a]!++;
      counts[p.key][b]!--;
      painted = b;
    }
  }
  let peak = 0;
  let queuePeak = 0;
  const running = new Int32Array(STACK_ORDER.length);
  for (let x = 0; x < width; x++) {
    let total = 0;
    STACK_ORDER.forEach((k, n) => {
      running[n]! += counts[k][x]!;
      counts[k][x] = running[n]!;
      total += running[n]!;
    });
    peak = Math.max(peak, total);
    queuePeak = Math.max(queuePeak, total - counts.gap[x]!);
  }
  return { counts, peak, queuePeak };
}

export interface RowStack {
  row: number;
  parts: { key: PieceKey; ms: number }[];
  total: number;
}

export function rowStack(shape: RowShape, row: number): RowStack {
  const parts = STACK_ORDER.filter((key) => key !== 'gap').map((key) => ({
    key,
    ms: shape.pieces.reduce((sum, p) => (p.key === key ? sum + p.t1 - p.t0 : sum), 0),
  })).filter((p) => p.ms > 0);
  return { row, parts, total: parts.reduce((sum, p) => sum + p.ms, 0) };
}

export function rowStacks(shapes: RowShape[], v: View): { stacks: RowStack[]; peak: number } {
  const { first, last } = visibleRows(v, shapes.length);
  const stacks: RowStack[] = [];
  let peak = 0;
  for (let i = first; i <= last; i++) {
    const stack = rowStack(shapes[i]!, i);
    stacks.push(stack);
    peak = Math.max(peak, stack.total);
  }
  return { stacks, peak };
}

export function viewCounts(rows: PrRow[], v: View): { entered: number; merged: number } {
  const from = timeAt(v, 0);
  const to = timeAt(v, v.width);
  let entered = 0;
  let merged = 0;
  for (const row of rows) {
    for (const a of row.attempts) {
      if (a.start >= from && a.start <= to) entered++;
      if (a.outcome === 'merged' && a.end !== null && a.end >= from && a.end <= to) merged++;
    }
  }
  return { entered, merged };
}
