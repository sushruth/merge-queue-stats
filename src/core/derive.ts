import { DAY_MS } from './attempts';
import { dayKey } from './runs';
import { lifecycle, queueSegments, summarize, summarizeRuns, weekKey } from './stats';
import type { Attempt, Run, Stage } from './types';

export const OUTCOMES = [
  { key: 'merged', label: 'Merged', color: 'var(--s1)' },
  { key: 'failed_checks', label: 'Failed checks', color: 'var(--s2)' },
  { key: 'manual', label: 'Removed by hand', color: 'var(--s3)' },
  { key: 'merge_conflict', label: 'Merge conflict', color: 'var(--s4)' },
  { key: 'other', label: 'Other removal', color: 'var(--s5)' },
  { key: 'queued', label: 'Still queued', color: 'var(--s6)' },
] as const;

export type OutcomeKey = (typeof OUTCOMES)[number]['key'];

export const outcomeKey = (outcome: string): OutcomeKey =>
  OUTCOMES.find((o) => o.key === outcome)?.key ?? 'other';

export const outcomeLabel = (outcome: string): string =>
  OUTCOMES.find((o) => o.key === outcome)?.label ?? outcome.replace(/_/g, ' ');

export function weeklyRows(attempts: Attempt[], runs: Run[]) {
  const weeks = new Set([...attempts.map((a) => weekKey(a.start)), ...runs.map((r) => weekKey(r.created))]);
  return [...weeks].sort().map((week) => ({
    week,
    t: Date.parse(week),
    ...summarize(attempts.filter((a) => weekKey(a.start) === week)),
    ...summarizeRuns(runs.filter((r) => weekKey(r.created) === week)),
  }));
}

export type WeekRow = ReturnType<typeof weeklyRows>[number];

export interface DayRow {
  t: number;
  total: number;
  counts: Partial<Record<OutcomeKey, number>>;
}

export function dayRows(attempts: Attempt[], now: number): DayRow[] {
  if (!attempts.length) return [];
  const byDay = new Map<string, DayRow>();
  let first = Infinity;
  for (const a of attempts) {
    const key = dayKey(a.start);
    const t = Date.parse(key);
    first = Math.min(first, t);
    let row = byDay.get(key);
    if (!row) byDay.set(key, (row = { t, total: 0, counts: {} }));
    const o = outcomeKey(a.outcome);
    row.counts[o] = (row.counts[o] ?? 0) + 1;
    row.total++;
  }
  const out: DayRow[] = [];
  for (let t = first; t <= now; t += DAY_MS) out.push(byDay.get(dayKey(t)) ?? { t, total: 0, counts: {} });
  return out;
}

export interface Range {
  from: number;
  to: number;
}

export function resolveRange(
  days: number,
  rangeFrom: string | null,
  rangeTo: string | null,
  now: number,
): Range {
  if (!rangeFrom && !rangeTo) return { from: now - days * DAY_MS, to: now };
  const to = rangeTo ? Math.min(Date.parse(rangeTo) + DAY_MS, now) : now;
  const from = rangeFrom ? Date.parse(rangeFrom) : to - days * DAY_MS;
  return { from, to };
}

export interface PrRow {
  pr: number;
  start: number;
  attempts: Attempt[];
  stages: Stage[][];
  shown: Attempt[];
}

export function prRows(attempts: Attempt[], byPr: Map<number, Run[]>, { from, to }: Range, now: number): PrRow[] {
  const grouped = new Map<number, Attempt[]>();
  for (const a of attempts) {
    const list = grouped.get(a.pr);
    if (list) list.push(a);
    else grouped.set(a.pr, [a]);
  }
  const rows: PrRow[] = [];
  for (const [pr, list] of grouped) {
    const shown = list.filter((a) => a.start < to && (a.end ?? now) > from).sort((a, b) => a.start - b.start);
    if (!shown.length) continue;
    const all = [...list].sort((a, b) => a.start - b.start);
    const runs = byPr.get(pr) ?? [];
    rows.push({
      pr,
      start: shown[0]!.start,
      attempts: all,
      shown,
      stages: all.map((a) => lifecycle(a, runs, now)),
    });
  }
  return rows.sort((a, b) => b.start - a.start || b.pr - a.pr);
}

export function rangeSummary(attempts: Attempt[], { from, to }: Range, now: number) {
  const inRange = summarize(attempts.filter((a) => a.start >= from && a.start < to));
  const peak = queueSegments(attempts, now).reduce(
    (best, s) => (s.t0 < to && s.t1 > from ? Math.max(best, s.pos + 1) : best),
    0,
  );
  return { ...inRange, peak };
}

export type HoverPart = { attempt: Attempt } | { gapBefore: Attempt } | null;

export function partAt(row: PrRow, t: number, slack: number, now: number): HoverPart {
  const { shown } = row;
  const lastEnd = shown[shown.length - 1]!;
  if (t < shown[0]!.start - slack || t > (lastEnd.end ?? now) + slack) return null;
  let nearest: Attempt = shown[0]!;
  for (const a of shown) {
    const end = a.end ?? now;
    if (t >= a.start - slack && t <= end + slack) return { attempt: a };
    if (a.start <= t) nearest = a;
  }
  const next = shown[shown.indexOf(nearest) + 1];
  return next ? { gapBefore: next } : { attempt: nearest };
}

export interface MinuteTick {
  step: number;
  max: number;
}

export function niceScale(value: number, minutes = false): MinuteTick {
  const top = Math.max(value, 1);
  const steps = minutes
    ? [15, 30, 60, 120, 180, 240, 360, 480, 720, 1440, 2880]
    : [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  const step = steps.find((s) => top / s <= 5) ?? steps[steps.length - 1]!;
  return { step, max: Math.ceil(top / step) * step };
}
