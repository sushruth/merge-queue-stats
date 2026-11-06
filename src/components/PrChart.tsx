import { CornersOut, MagnifyingGlassMinus, MagnifyingGlassPlus } from '@phosphor-icons/react';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import { fmtMin, fmtPct } from '../core/format';
import { prRows, rangeSummary, resolveRange } from '../core/derive';
import { rowShape } from '../core/rowShape';
import { runsByPr } from '../core/runs';
import { clampView, extentOf, fitAll, frameRange, matchesRange, rebase, rowSpan, zoomAt, type View } from '../core/view';
import type { Derived } from '../stores/derived';
import { useSettings } from '../stores/settings';
import { useUi } from '../stores/ui';
import { startFrameResize } from './frameResize';
import { Legend } from './Legend';
import { PrHistograms } from './PrHistograms';
import { PrMinimap } from './PrMinimap';
import { LEGEND } from './prTip';
import { PRESETS, RangeControl } from './RangeControl';
import { usePrGestures, ZOOM_STEP } from './usePrGestures';
import { usePrHover } from './usePrHover';
import { usePrPaint } from './usePrPaint';

const ALL_TIME = { from: -Infinity, to: Infinity };

export function PrChart({ derived }: { derived: Derived }) {
  const { attempts, runs, now } = derived;
  const rangeDays = useSettings((s) => s.rangeDays);
  const rangeFrom = useSettings((s) => s.rangeFrom);
  const rangeTo = useSettings((s) => s.rangeTo);
  const repo = useSettings((s) => s.repo);
  const chartWidth = useSettings((s) => s.chartWidth);
  const chartHeight = useSettings((s) => s.chartHeight);
  const frameRequest = useUi((s) => s.frameRequest);

  const frameEl = useRef<HTMLDivElement>(null);
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const mapEl = useRef<HTMLCanvasElement>(null);
  const plotEl = useRef<HTMLDivElement>(null);
  const rightEl = useRef<HTMLCanvasElement>(null);
  const bottomEl = useRef<HTMLCanvasElement>(null);

  const framedDays = useUi((s) => {
    const { view } = s;
    if (!view) return null;
    return PRESETS.find((p) => matchesRange(view, resolveRange(p.days, null, null, now)))?.days ?? null;
  });
  const range = useMemo(() => resolveRange(rangeDays, rangeFrom, rangeTo, now), [rangeDays, rangeFrom, rangeTo, now]);
  const statsRange = useMemo(
    () => (framedDays === null ? range : resolveRange(framedDays, null, null, now)),
    [framedDays, range, now],
  );
  const rows = useMemo(() => prRows(attempts, runsByPr(runs), ALL_TIME, now), [attempts, runs, now]);
  const summary = useMemo(() => rangeSummary(attempts, statsRange, now), [attempts, statsRange, now]);
  const shapes = useMemo(() => rows.map((r) => rowShape(r, now)), [rows, now]);
  const extent = useMemo(() => extentOf(rows, now), [rows, now]);
  const rowIndex = useMemo(() => new Map(rows.map((r, i) => [r.pr, i])), [rows]);
  const frameKey = `${rangeDays}|${rangeFrom}|${rangeTo}|${repo}|${frameRequest}`;
  const hasRows = rows.length > 0;

  const latest = useRef({ rows, shapes, extent, range, now, rowIndex, frameKey, repo });
  latest.current = { rows, shapes, extent, range, now, rowIndex, frameKey, repo };

  const place = useRef({ framedKey: '', untouched: false, rows: 0, now: 0 });
  const invalidate = usePrPaint(canvasEl, mapEl, { right: rightEl, bottom: bottomEl }, latest, { shapes, extent });
  const { hover, clearHover } = usePrHover(canvasEl, latest);

  const framed = (size: Pick<View, 'width' | 'height'>): View => {
    const { rows: r, range: rg, now: n, extent: e } = latest.current;
    return frameRange(size, rg, rowSpan(r, rg, n), e);
  };

  const syncView = (): void => {
    const el = plotEl.current;
    const { rows: r, extent: e, now: n, frameKey: key } = latest.current;
    if (!el || !r.length || !el.clientWidth || !el.clientHeight) return;
    const size = { width: el.clientWidth, height: el.clientHeight };
    const p = place.current;
    const { view, setView } = useUi.getState();
    if (!view || p.framedKey !== key || p.untouched) {
      p.framedKey = key;
      p.untouched = true;
      setView(framed(size));
    } else if (p.rows !== r.length || p.now !== n) {
      setView(rebase({ ...view, ...size }, { rows: p.rows, now: p.now }, e));
    } else if (view.width !== size.width || view.height !== size.height) {
      setView(clampView({ ...view, ...size }, e));
    }
    p.rows = r.length;
    p.now = n;
  };

  const apply = (next: View): void => {
    place.current.untouched = false;
    useUi.getState().setView(next);
  };

  const zoomCentre = (factor: number): void => {
    const view = useUi.getState().view;
    if (view) apply(zoomAt(view, factor, view.width / 2, view.height / 2, latest.current.extent));
  };

  const fit = (): void => {
    const view = useUi.getState().view;
    if (view) apply(fitAll(view, latest.current.extent));
  };

  useLayoutEffect(syncView, [rows, now, frameKey, hasRows]);

  useLayoutEffect(() => {
    const el = plotEl.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      syncView();
      invalidate();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasRows]);

  useEffect(
    () => () => {
      clearHover();
      useUi.getState().setView(null);
    },
    [],
  );

  const { onPointerDown, onPointerMove, onPointerUp, onClick, onKeyDown } = usePrGestures({
    canvasEl,
    latest,
    hasRows,
    apply,
    hover,
    clearHover,
    zoomCentre,
    fit,
  });

  const startResize = (ev: PointerEvent, horizontal: boolean, vertical: boolean): void => {
    if (frameEl.current) startFrameResize(ev, frameEl.current, horizontal, vertical);
  };

  return (
    <section class="section">
      <div class="section-head">
        <h2>Pull requests in the queue</h2>
        <p class="quiet">
          {summary.attempts} attempts · {fmtPct(summary.rate)} merged · median wait {fmtMin(summary.p50)} · peak{' '}
          {summary.peak} in queue
        </p>
      </div>
      <div class="prc-tools">
        <RangeControl since={derived.earliest} now={now} />
        {hasRows && (
          <div class="prc-zoom">
            <button type="button" class="bare" aria-label="Zoom in" title="Zoom in" onClick={() => zoomCentre(ZOOM_STEP)}>
              <MagnifyingGlassPlus size={16} />
            </button>
            <button type="button" class="bare" aria-label="Zoom out" title="Zoom out" onClick={() => zoomCentre(1 / ZOOM_STEP)}>
              <MagnifyingGlassMinus size={16} />
            </button>
            <button type="button" class="bare" aria-label="Fit all pull requests" title="Fit all" onClick={fit}>
              <CornersOut size={16} />
            </button>
          </div>
        )}
      </div>
      {hasRows ? (
        <div class="prc-frame" ref={frameEl} style={{ width: chartWidth ?? '100%', height: chartHeight }}>
          <div class="prc-plot" ref={plotEl}>
          <canvas
            ref={canvasEl}
            class="prc-canvas"
            tabIndex={0}
            role="img"
            aria-label="Pull requests over time. Drag or scroll to pan, plus and minus to zoom, zero to fit everything."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={clearHover}
            onClick={onClick}
            onKeyDown={onKeyDown}
          />
          <PrMinimap canvasRef={mapEl} latest={latest} apply={apply} clearHover={clearHover} />
          </div>
          <PrHistograms rightRef={rightEl} bottomRef={bottomEl} latest={latest} clearHover={clearHover} />
          <div class="prc-grip prc-grip-s" onPointerDown={(ev) => startResize(ev, false, true)} />
          <div class="prc-grip prc-grip-e" onPointerDown={(ev) => startResize(ev, true, false)} />
          <div class="prc-grip prc-grip-se" onPointerDown={(ev) => startResize(ev, true, true)} />
        </div>
      ) : (
        <p class="quiet empty">No pull requests were in the queue in this range.</p>
      )}
      <Legend items={LEGEND} />
    </section>
  );
}
