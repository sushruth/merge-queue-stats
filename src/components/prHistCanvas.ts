import { fmtMin } from '../core/format';
import { columnStacks, rowStacks, STACK_ORDER, viewCounts } from '../core/histogram';
import type { PrRow } from '../core/derive';
import type { RowShape } from '../core/rowShape';
import { AXIS, yOfRow, type View } from '../core/view';
import { fitBitmap, type Palette } from './prCanvas';

export const HIST_RIGHT = 72;
export const HIST_BOTTOM = 64;

const LABEL_BAND = 18;
const DIMMED = 0.22;

const label = (ctx: CanvasRenderingContext2D, text: string, p: Palette, y: number): void => {
  ctx.font = `11px ${p.font}`;
  ctx.fillStyle = p.text3;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, 4, y);
};

export function drawBottomHist(canvas: HTMLCanvasElement, shapes: RowShape[], rows: PrRow[], v: View, p: Palette, dpr: number): void {
  const ctx = fitBitmap(canvas, v.width, HIST_BOTTOM, dpr);
  if (!ctx) return;
  ctx.clearRect(0, 0, v.width, HIST_BOTTOM);
  const { counts, peak, queuePeak } = columnStacks(shapes, v);
  const unit = peak ? (HIST_BOTTOM - LABEL_BAND) / peak : 0;
  for (let x = 0; x < v.width; x++) {
    let y = HIST_BOTTOM;
    for (const key of STACK_ORDER) {
      const n = counts[key][x]!;
      if (!n) continue;
      ctx.fillStyle = p[key];
      ctx.fillRect(x, y - n * unit, 1, n * unit);
      y -= n * unit;
    }
  }
  const { entered, merged } = viewCounts(rows, v);
  label(ctx, `${queuePeak} peak in queue · ${entered} entered · ${merged} merged in this time`, p, 12);
}

export function drawRightHist(canvas: HTMLCanvasElement, shapes: RowShape[], v: View, hovered: number, p: Palette, dpr: number): void {
  const ctx = fitBitmap(canvas, HIST_RIGHT, v.height, dpr);
  if (!ctx) return;
  ctx.clearRect(0, 0, HIST_RIGHT, v.height);
  const { stacks, peak } = rowStacks(shapes, v);
  const unit = peak ? HIST_RIGHT / peak : 0;
  const bar = v.rowPx >= 4 ? (v.rowPx * 11) / 14 : Math.max(1, v.rowPx);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, AXIS, HIST_RIGHT, v.height - AXIS);
  ctx.clip();
  for (const { row, parts } of stacks) {
    const y = yOfRow(v, row) + (v.rowPx - bar) / 2;
    ctx.globalAlpha = hovered >= 0 && hovered !== row ? DIMMED : 1;
    let x = 0;
    for (const part of parts) {
      ctx.fillStyle = p[part.key];
      ctx.fillRect(x, y, part.ms * unit, bar);
      x += part.ms * unit;
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.line;
  ctx.fillRect(0, AXIS - 1, HIST_RIGHT, 1);
  if (peak) label(ctx, `max ${fmtMin(peak / 60e3)}`, p, 16);
}
