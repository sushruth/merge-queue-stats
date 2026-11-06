import { dayKey } from './runs';
import type { Attempt, QueueSegment, Run, Stage, StageKind } from './types';

export function pct(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

export function weekKey(t: number): string {
  const d = new Date(t);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return dayKey(d.getTime());
}

export function summarize(list: Attempt[]) {
  const finished = list.filter((a) => a.end !== null);
  const merged = finished.filter((a) => a.outcome === 'merged');
  const waits = merged.map((a) => (a.end! - a.start) / 60e3);
  return {
    attempts: list.length,
    merged: merged.length,
    notMerged: finished.length - merged.length,
    rate: finished.length ? (merged.length / finished.length) * 100 : null,
    p50: pct(waits, 50),
    p90: pct(waits, 90),
    max: pct(waits, 100),
  };
}

export function summarizeRuns(runs: Run[]) {
  const done = runs.filter((r) => r.conclusion !== null);
  const failed = done.filter((r) => r.conclusion === 'failure').length;
  const okMinutes = done
    .filter((r) => r.conclusion === 'success')
    .map((r) => (r.updated - r.started) / 60e3);
  return {
    runs: done.length,
    failed,
    failRate: done.length ? (failed / done.length) * 100 : null,
    okP50: pct(okMinutes, 50),
  };
}

function runKind(conclusion: string | null): StageKind {
  if (conclusion === null) return 'running';
  if (conclusion === 'success') return 'passed';
  if (conclusion === 'failure') return 'failed';
  return 'cancelled';
}

export function lifecycle(a: Pick<Attempt, 'start' | 'end'>, runs: Run[], now: number): Stage[] {
  const end = a.end ?? now;
  const inside = runs
    .filter((r) => r.created >= a.start && r.created <= end)
    .sort((x, y) => x.created - y.created);
  const pieces: Stage[] = [];
  const push = (t0: number, t1: number, kind: StageKind): void => {
    if (t1 > t0) pieces.push({ t0, t1, kind });
  };
  const between = (last: 'passed' | 'failed' | null): StageKind => (last ? `after-${last}` : 'wait');
  let t = a.start;
  let last: 'passed' | 'failed' | null = null;
  inside.forEach((r, i) => {
    push(t, r.created, between(last));
    const stop = Math.min(
      r.conclusion === null ? end : r.updated,
      end,
      inside[i + 1]?.created ?? Infinity,
    );
    const kind = runKind(r.conclusion);
    push(r.created, stop, kind);
    t = Math.max(stop, r.created);
    last = kind === 'passed' || kind === 'failed' ? kind : null;
  });
  push(t, end, between(last));
  return pieces;
}

export function queueSegments(attempts: Pick<Attempt, 'start' | 'end'>[], now: number): QueueSegment[] {
  const edges = attempts
    .flatMap((a, i): [number, 1 | -1, number][] => [
      [a.start, 1, i],
      [a.end ?? now, -1, i],
    ])
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const queue: number[] = [];
  const segs: QueueSegment[] = [];
  const since = new Map<number, number>();
  const close = (i: number, pos: number, t: number): void => {
    const t0 = since.get(i)!;
    if (t > t0) segs.push({ i, pos, t0, t1: t });
    since.set(i, t);
  };
  for (const [t, direction, i] of edges) {
    if (direction === 1) {
      since.set(i, t);
      queue.push(i);
      continue;
    }
    const at = queue.indexOf(i);
    if (at < 0) continue;
    for (let p = at; p < queue.length; p++) close(queue[p]!, p, t);
    queue.splice(at, 1);
  }
  return segs;
}
