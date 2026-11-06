import { CAP, stripRadius, stripsOf, type PieceKey, type RowShape } from '../core/rowShape';
import { axisTicks } from '../core/ticks';
import { minimapBox } from '../core/minimap';
import { visibleRows } from '../core/histogram';
import { AXIS, xOf, yOfRow, type Extent, type View } from '../core/view';

const VARS = {
  wait: '--st-wait',
  passed: '--st-passed',
  failed: '--st-failed',
  running: '--st-running',
  cancelled: '--st-cancelled',
  'after-passed': '--st-after-passed',
  'after-failed': '--st-after-failed',
  gap: '--st-gap',
  bg: '--bg',
  text: '--text',
  text2: '--text-2',
  text3: '--text-3',
  line: '--line',
  lineSoft: '--line-soft',
  accent: '--accent',
};

export type Palette = Record<keyof typeof VARS, string> & { font: string };

const PAINT_ORDER: PieceKey[] = ['gap', 'wait', 'after-passed', 'after-failed', 'passed', 'failed', 'cancelled', 'running'];
const VEIL_ALPHA = 0.78;
const LEGIBLE_BAR = 3;
const SPACED_ROW = 4;
const MIN_BAR = 1.5;
const MAP_DENSITY_ALPHA = 0.5;

export function readPalette(host: HTMLElement): Palette {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  host.append(probe);
  const out = { font: getComputedStyle(host).fontFamily } as Palette;
  for (const [key, name] of Object.entries(VARS)) {
    // Custom properties come back as unresolved color-mix() text; a real colour property resolves them for canvas.
    probe.style.color = `var(${name})`;
    out[key as keyof typeof VARS] = getComputedStyle(probe).color;
  }
  probe.remove();
  return out;
}

export function fitBitmap(canvas: HTMLCanvasElement, width: number, height: number, dpr: number): CanvasRenderingContext2D | null {
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}


function drawThin(ctx: CanvasRenderingContext2D, shapes: RowShape[], v: View, first: number, last: number, p: Palette, snap: (n: number) => number, bar: number): void {
  const buckets = new Map<PieceKey, number[]>(PAINT_ORDER.map((k) => [k, []]));
  for (let i = first; i <= last; i++) {
    const y = snap(yOfRow(v, i));
    for (const piece of shapes[i]!.pieces) {
      const left = Math.round(xOf(v, piece.t0));
      const right = Math.round(xOf(v, piece.t1));
      if (right < 0 || left > v.width) continue;
      buckets.get(piece.key)!.push(left, y, Math.max(1, right - left));
    }
  }
  for (const [key, rects] of buckets) {
    ctx.fillStyle = p[key];
    for (let n = 0; n < rects.length; n += 3) ctx.fillRect(rects[n]!, rects[n + 1]!, rects[n + 2]!, bar);
  }
}

function drawLegible(ctx: CanvasRenderingContext2D, shapes: RowShape[], v: View, first: number, last: number, p: Palette, snap: (n: number) => number, bar: number, inset: number): void {
  const x = (t: number): number => xOf(v, t);
  for (let i = first; i <= last; i++) {
    const y = snap(yOfRow(v, i) + inset);
    for (const strip of stripsOf(shapes[i]!, x)) {
      if (strip.right < 0 || strip.left > v.width) continue;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(strip.left, y, strip.right - strip.left, bar, stripRadius(strip, bar));
      ctx.clip();
      for (const part of strip.parts) {
        ctx.fillStyle = p[part.key];
        ctx.fillRect(part.left, y, part.right - part.left, bar);
      }
      ctx.fillStyle = p.text;
      for (const at of strip.caps) ctx.fillRect(at - CAP, y, CAP, bar);
      ctx.restore();
    }
  }
}

export function drawChart(ctx: CanvasRenderingContext2D, shapes: RowShape[], v: View, now: number, hovered: number, p: Palette, dpr: number): void {
  const snap = (n: number): number => Math.round(n * dpr) / dpr;
  const ticks = axisTicks(v);
  const bottom = Math.min(v.height, yOfRow(v, shapes.length));
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, v.width, v.height);

  for (const major of [false, true]) {
    ctx.fillStyle = major ? p.line : p.lineSoft;
    for (const tick of ticks) {
      if (tick.major === major) ctx.fillRect(Math.round(xOf(v, tick.t)), AXIS, 1, v.height - AXIS);
    }
  }

  const { first, last } = visibleRows(v, shapes.length);
  const spaced = v.rowPx >= SPACED_ROW;
  const bar = spaced ? snap((v.rowPx * 11) / 14) : Math.max(MIN_BAR, snap(v.rowPx));
  if (bar >= LEGIBLE_BAR) drawLegible(ctx, shapes, v, first, last, p, snap, bar, (v.rowPx - bar) / 2);
  else drawThin(ctx, shapes, v, first, last, p, snap, bar);

  ctx.fillStyle = p.text3;
  ctx.fillRect(Math.min(v.width - 1, Math.round(xOf(v, now))), AXIS, 1, Math.max(0, bottom - AXIS));

  if (hovered >= 0) {
    const top = yOfRow(v, hovered);
    ctx.globalAlpha = VEIL_ALPHA;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, AXIS, v.width, top - AXIS);
    ctx.fillRect(0, top + v.rowPx, v.width, v.height - top - v.rowPx);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, v.width, AXIS);
  ctx.textBaseline = 'alphabetic';
  for (const tick of ticks) {
    const at = Math.round(xOf(v, tick.t));
    ctx.fillStyle = p.line;
    ctx.fillRect(at, tick.major ? 0 : AXIS - 6, 1, tick.major ? AXIS : 6);
    ctx.font = `${tick.major ? '600 ' : ''}11px ${p.font}`;
    ctx.fillStyle = tick.major ? p.text2 : p.text3;
    ctx.fillText(tick.label, at + 4, 16);
  }
  ctx.fillStyle = p.line;
  ctx.fillRect(0, AXIS - 1, v.width, 1);
}

export function buildMinimap(shapes: RowShape[], e: Extent, width: number, height: number, p: Palette, dpr: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = fitBitmap(canvas, width, height, dpr);
  if (!ctx) return canvas;
  const span = Math.max(1, e.tMax - e.tMin);
  const rowH = Math.max(1 / dpr, height / Math.max(1, e.rows));
  ctx.fillStyle = p.text3;
  ctx.globalAlpha = MAP_DENSITY_ALPHA;
  shapes.forEach((shape, i) => {
    const y = (i / Math.max(1, e.rows)) * height;
    for (const piece of shape.pieces) {
      if (piece.key === 'gap') continue;
      const left = ((piece.t0 - e.tMin) / span) * width;
      ctx.fillRect(left, y, Math.max(1 / dpr, ((piece.t1 - piece.t0) / span) * width), rowH);
    }
  });
  return canvas;
}

export function drawMinimap(ctx: CanvasRenderingContext2D, density: HTMLCanvasElement, v: View, e: Extent, width: number, height: number, p: Palette): void {
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(density, 0, 0, width, height);
  const box = minimapBox(v, e, width, height);
  const w = Math.max(3, box.w);
  const h = Math.max(3, box.h);
  ctx.fillStyle = p.accent;
  ctx.globalAlpha = 0.14;
  ctx.fillRect(box.x, box.y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(box.x) + 0.5, Math.round(box.y) + 0.5, Math.max(2, Math.round(w) - 1), Math.max(2, Math.round(h) - 1));
}
