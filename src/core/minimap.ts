import { between, clampView, plotHeight, timeAt, type Extent, type View } from './view';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function minimapBox(v: View, e: Extent, mw: number, mh: number): Box {
  const span = Math.max(1, e.tMax - e.tMin);
  const rows = Math.max(1, e.rows);
  const x0 = between(((v.t0 - e.tMin) / span) * mw, 0, mw);
  const x1 = between(((timeAt(v, v.width) - e.tMin) / span) * mw, 0, mw);
  const y0 = between((v.y0 / rows) * mh, 0, mh);
  const y1 = between(((v.y0 + plotHeight(v) / v.rowPx) / rows) * mh, 0, mh);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function centerFromMinimap(v: View, e: Extent, mx: number, my: number, mw: number, mh: number): View {
  const t = e.tMin + (mx / mw) * (e.tMax - e.tMin);
  const row = (my / mh) * Math.max(1, e.rows);
  return clampView(
    { ...v, t0: t - v.width / 2 / v.pxPerMs, y0: row - plotHeight(v) / 2 / v.rowPx },
    e,
  );
}
