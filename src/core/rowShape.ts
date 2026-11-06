import type { PrRow } from './derive';
import type { StageKind } from './types';

export const CAP = 3;

export type PieceKey = StageKind | 'gap';

export interface Piece {
  key: PieceKey;
  t0: number;
  t1: number;
}

export interface RowShape {
  pieces: Piece[];
  caps: number[];
}

export function rowShape(row: PrRow, now: number): RowShape {
  const pieces: Piece[] = [];
  const caps: number[] = [];
  row.attempts.forEach((a, i) => {
    const end = a.end ?? now;
    for (const p of row.stages[i]!) if (p.t1 > p.t0) pieces.push({ key: p.kind, t0: p.t0, t1: p.t1 });
    const next = row.attempts[i + 1];
    if (next && next.start > end) pieces.push({ key: 'gap', t0: end, t1: next.start });
    if (a.end !== null && a.outcome !== 'merged') caps.push(a.end);
  });
  return { pieces, caps };
}

export interface Strip {
  left: number;
  right: number;
  parts: { key: PieceKey; left: number; right: number }[];
  caps: number[];
}

export function stripsOf({ pieces, caps }: RowShape, x: (t: number) => number): Strip[] {
  const strips: Strip[] = [];
  let current: Strip | undefined;
  for (const p of pieces) {
    const left = Math.round(x(p.t0));
    const right = left + Math.max(1, Math.round(x(p.t1)) - left);
    if (current && left <= current.right) {
      current.right = Math.max(current.right, right);
    } else {
      current = { left, right, parts: [], caps: [] };
      strips.push(current);
    }
    current.parts.push({ key: p.key, left, right });
  }
  for (const t of caps) {
    const at = Math.round(x(t));
    const strip = strips.find((s) => at >= s.left && at <= s.right);
    if (strip) strip.caps.push(at);
    else strips.push({ left: at - CAP, right: at, parts: [], caps: [at] });
  }
  return strips;
}

export function stripRadius(strip: Pick<Strip, 'left' | 'right'>, barHeight: number): number {
  return Math.min(3, (barHeight * 3) / 11, (strip.right - strip.left) / 2);
}
