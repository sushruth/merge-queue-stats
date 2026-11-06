import { useEffect, useRef } from 'preact/hooks';
import type { PrRow } from '../core/derive';
import { hitTest, panBy, zoomAt, type Extent, type View } from '../core/view';
import { useUi } from '../stores/ui';

const DRAG_SLOP = 3;
export const ZOOM_STEP = 1.5;
const WHEEL_ZOOM = 0.01;
const WHEEL_ZOOM_MAX = 50;

interface Options {
  canvasEl: { current: HTMLCanvasElement | null };
  latest: { current: { rows: PrRow[]; extent: Extent; now: number; repo: string | null } };
  hasRows: boolean;
  apply(next: View): void;
  hover(clientX: number, clientY: number): boolean;
  clearHover(): void;
  zoomCentre(factor: number): void;
  fit(): void;
}

export function usePrGestures({ canvasEl, latest, hasRows, apply, hover, clearHover, zoomCentre, fit }: Options) {
  const gesture = useRef({ dragged: false, lastTouch: false });

  useEffect(() => {
    const canvas = canvasEl.current;
    if (!canvas) return;
    const onWheel = (ev: WheelEvent): void => {
      const { view } = useUi.getState();
      if (!view) return;
      const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? view.height : 1;
      const rect = canvas.getBoundingClientRect();
      const e = latest.current.extent;
      if (ev.ctrlKey || ev.metaKey) {
        ev.preventDefault();
        const d = Math.max(-WHEEL_ZOOM_MAX, Math.min(WHEEL_ZOOM_MAX, ev.deltaY * unit));
        apply(zoomAt(view, Math.exp(-d * WHEEL_ZOOM), ev.clientX - rect.left, ev.clientY - rect.top, e));
      } else {
        const next = panBy(view, -ev.deltaX * unit, -ev.deltaY * unit, e);
        // At the clamp the view cannot move, so the page gets the scroll instead of trapping it.
        if (next.t0 === view.t0 && next.y0 === view.y0) return;
        ev.preventDefault();
        apply(next);
      }
      hover(ev.clientX, ev.clientY);
    };
    let gestureScale = 1;
    const onGestureStart = (ev: Event): void => {
      ev.preventDefault();
      gestureScale = 1;
    };
    // Safari reports trackpad pinch as gesture events, never as ctrl+wheel.
    const onGestureChange = (ev: Event): void => {
      ev.preventDefault();
      const g = ev as Event & { scale: number; clientX: number; clientY: number };
      const { view } = useUi.getState();
      if (!view) return;
      const rect = canvas.getBoundingClientRect();
      apply(zoomAt(view, g.scale / gestureScale, g.clientX - rect.left, g.clientY - rect.top, latest.current.extent));
      gestureScale = g.scale;
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('gesturestart', onGestureStart);
    canvas.addEventListener('gesturechange', onGestureChange);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('gesturestart', onGestureStart);
      canvas.removeEventListener('gesturechange', onGestureChange);
    };
  }, [hasRows]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const startAt = useRef({ x: 0, y: 0 });

  const onPointerDown = (ev: PointerEvent): void => {
    gesture.current.lastTouch = ev.pointerType === 'touch';
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    startAt.current = { x: ev.clientX, y: ev.clientY };
    gesture.current.dragged = false;
    (ev.currentTarget as HTMLCanvasElement).setPointerCapture(ev.pointerId);
  };

  const onPointerMove = (ev: PointerEvent): void => {
    const canvas = ev.currentTarget as HTMLCanvasElement;
    const prev = pointers.current.get(ev.pointerId);
    if (!prev) {
      hover(ev.clientX, ev.clientY);
      return;
    }
    const { view } = useUi.getState();
    if (!view) return;
    const e = latest.current.extent;
    const list = [...pointers.current.entries()];
    if (list.length === 2) {
      const other = list.find(([id]) => id !== ev.pointerId)![1];
      const rect = canvas.getBoundingClientRect();
      const before = Math.hypot(prev.x - other.x, prev.y - other.y) || 1;
      const after = Math.hypot(ev.clientX - other.x, ev.clientY - other.y) || 1;
      const mx = (ev.clientX + other.x) / 2 - rect.left;
      const my = (ev.clientY + other.y) / 2 - rect.top;
      const panned = panBy(view, (ev.clientX - prev.x) / 2, (ev.clientY - prev.y) / 2, e);
      gesture.current.dragged = true;
      clearHover();
      apply(zoomAt(panned, after / before, mx, my, e));
    } else {
      const moved = Math.hypot(ev.clientX - startAt.current.x, ev.clientY - startAt.current.y);
      if (moved > DRAG_SLOP) gesture.current.dragged = true;
      if (gesture.current.dragged) {
        clearHover();
        canvas.style.cursor = 'grabbing';
        apply(panBy(view, ev.clientX - prev.x, ev.clientY - prev.y, e));
      }
    }
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  };

  const onPointerUp = (ev: PointerEvent): void => {
    pointers.current.delete(ev.pointerId);
    (ev.currentTarget as HTMLCanvasElement).style.cursor = '';
    if (ev.pointerType !== 'touch') hover(ev.clientX, ev.clientY);
  };

  const onClick = (ev: MouseEvent): void => {
    if (gesture.current.dragged) return;
    const ui = useUi.getState();
    const canvas = canvasEl.current;
    if (!ui.view || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { rows: r, now: n, repo: name } = latest.current;
    const found = hitTest(ui.view, r, ev.clientX - rect.left, ev.clientY - rect.top, n);
    if (!found) return;
    if (gesture.current.lastTouch && ui.hoveredPr !== found.row.pr) {
      hover(ev.clientX, ev.clientY);
      return;
    }
    window.open(`https://github.com/${name}/pull/${found.row.pr}`, '_blank', 'noopener');
  };

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === '+' || ev.key === '=') zoomCentre(ZOOM_STEP);
    else if (ev.key === '-' || ev.key === '_') zoomCentre(1 / ZOOM_STEP);
    else if (ev.key === '0') fit();
    else return;
    ev.preventDefault();
  };

  return { onPointerDown, onPointerMove, onPointerUp, onClick, onKeyDown };
}
