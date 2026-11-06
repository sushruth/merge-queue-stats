import { fmtMin, fmtWhen } from '../core/format';
import { outcomeLabel, type HoverPart, type PrRow } from '../core/derive';
import type { PieceKey } from '../core/rowShape';
import type { StageKind } from '../core/types';
import type { TipContent, TipRow } from '../stores/ui';

const MIN_STAGE_MS = 30e3;

const STAGES: Record<StageKind, { label: string; color: string }> = {
  wait: { label: 'Waiting for CI', color: 'var(--st-wait)' },
  passed: { label: 'CI run passed', color: 'var(--st-passed)' },
  failed: { label: 'CI run failed', color: 'var(--st-failed)' },
  running: { label: 'CI running now', color: 'var(--st-running)' },
  cancelled: { label: 'CI run cancelled', color: 'var(--st-cancelled)' },
  'after-passed': { label: 'Passed, waiting to merge', color: 'var(--st-after-passed)' },
  'after-failed': { label: 'Failed, still in the queue', color: 'var(--st-after-failed)' },
};
const GAP = { label: 'Out of the queue between attempts', color: 'var(--st-gap)' };
const LEFT = { label: 'Left the queue without merging', color: 'var(--text)' };

export const LEGEND = [
  ...Object.values(STAGES),
  GAP,
  { ...LEFT, thin: true },
];

export const pieceStyle = (key: PieceKey): { label: string; color: string } => (key === 'gap' ? GAP : STAGES[key]);

export function prTip(row: PrRow, part: HoverPart, now: number): TipContent {
  const { attempts, stages, shown, pr } = row;
  const rows: TipRow[] = [];
  let inQueue = 0;
  attempts.forEach((a, n) => {
    const end = a.end ?? now;
    inQueue += end - a.start;
    if (n) {
      const gap = a.start - (attempts[n - 1]!.end ?? now);
      if (gap > 0) {
        rows.push({
          value: fmtMin(gap / 60e3),
          label: 'Out of the queue',
          color: GAP.color,
          marked: !!part && 'gapBefore' in part && part.gapBefore === a,
        });
      }
    }
    rows.push({
      label: `Attempt ${n + 1} of ${attempts.length}: ${fmtWhen(a.start)} to ${a.end ? fmtWhen(a.end) : 'now'}, ${outcomeLabel(a.outcome).toLowerCase()}`,
      marked: !!part && 'attempt' in part && part.attempt === a,
    });
    for (const p of stages[n]!) {
      if (p.t1 - p.t0 < MIN_STAGE_MS) continue;
      const stage = STAGES[p.kind];
      rows.push({ value: fmtMin((p.t1 - p.t0) / 60e3), label: stage.label, color: stage.color });
    }
  });
  const v = shown.length;
  const what =
    v === attempts.length
      ? v === 1
        ? 'the only attempt'
        : `all ${v} attempts`
      : `${v} of ${attempts.length} attempts, the rest are outside this range,`;
  return {
    head: [`Highlighted: ${what} of PR #${pr}`, `${fmtMin(inQueue / 60e3)} in the queue in total. Times are UTC.`],
    rows,
  };
}

export function partKey(part: HoverPart, pr: number): string {
  if (!part) return '';
  return 'attempt' in part ? `${pr}:a${part.attempt.start}` : `${pr}:g${part.gapBefore.start}`;
}
