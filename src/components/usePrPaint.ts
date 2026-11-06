import { useEffect, useRef } from 'preact/hooks';
import type { PrRow } from '../core/derive';
import type { RowShape } from '../core/rowShape';
import type { Extent } from '../core/view';
import { useUi } from '../stores/ui';
import { MAP_H, MAP_W } from './PrMinimap';
import { drawBottomHist, drawRightHist } from './prHistCanvas';
import { buildMinimap, drawChart, drawMinimap, fitBitmap, readPalette, type Palette } from './prCanvas';

interface PaintInput {
  rows: PrRow[];
  shapes: RowShape[];
  extent: Extent;
  now: number;
  rowIndex: Map<number, number>;
}

export function usePrPaint(
  canvasEl: { current: HTMLCanvasElement | null },
  mapEl: { current: HTMLCanvasElement | null },
  histEls: { right: { current: HTMLCanvasElement | null }; bottom: { current: HTMLCanvasElement | null } },
  latest: { current: PaintInput },
  { shapes, extent }: Pick<PaintInput, 'shapes' | 'extent'>,
) {
  const paint = useRef<{ palette: Palette | null; density: HTMLCanvasElement | null; frame: number }>({
    palette: null,
    density: null,
    frame: 0,
  });

  const draw = (): void => {
    paint.current.frame = 0;
    const canvas = canvasEl.current;
    const view = useUi.getState().view;
    if (!canvas || !view) return;
    const { rows, shapes: s, extent: e, now: n, rowIndex: index } = latest.current;
    const dpr = window.devicePixelRatio || 1;
    const palette = (paint.current.palette ??= readPalette(canvas));
    const ctx = fitBitmap(canvas, view.width, view.height, dpr);
    const pr = useUi.getState().hoveredPr;
    const hovered = pr === null ? -1 : (index.get(pr) ?? -1);
    if (ctx) drawChart(ctx, s, view, n, hovered, palette, dpr);
    if (histEls.right.current) drawRightHist(histEls.right.current, s, view, hovered, palette, dpr);
    if (histEls.bottom.current) drawBottomHist(histEls.bottom.current, s, rows, view, palette, dpr);
    const map = mapEl.current;
    const mapCtx = map && fitBitmap(map, MAP_W, MAP_H, dpr);
    if (mapCtx) {
      const density = (paint.current.density ??= buildMinimap(s, e, MAP_W, MAP_H, palette, dpr));
      drawMinimap(mapCtx, density, view, e, MAP_W, MAP_H, palette);
    }
  };

  const invalidate = (): void => {
    if (!paint.current.frame) paint.current.frame = requestAnimationFrame(draw);
  };

  useEffect(() => {
    paint.current.density = null;
    invalidate();
  }, [shapes, extent]);

  useEffect(() => {
    invalidate();
    return useUi.subscribe((s, prev) => {
      if (s.view !== prev.view || s.hoveredPr !== prev.hoveredPr) invalidate();
    });
  }, []);

  useEffect(() => {
    const repaint = (): void => {
      paint.current.palette = null;
      paint.current.density = null;
      invalidate();
    };
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', repaint);
    const attrs = new MutationObserver(repaint);
    attrs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      media.removeEventListener('change', repaint);
      attrs.disconnect();
    };
  }, []);

  useEffect(() => () => cancelAnimationFrame(paint.current.frame), []);

  return invalidate;
}
