import { useRef } from 'preact/hooks';
import { centerFromMinimap, minimapBox } from '../core/minimap';
import type { Extent, View } from '../core/view';
import { useUi } from '../stores/ui';

export const MAP_W = 176;
export const MAP_H = 88;

interface Props {
  canvasRef: { current: HTMLCanvasElement | null };
  latest: { current: { extent: Extent } };
  apply(next: View): void;
  clearHover(): void;
}

export function PrMinimap({ canvasRef, latest, apply, clearHover }: Props) {
  const mapGrab = useRef<{ dx: number; dy: number } | null>(null);

  const mapAt = (ev: PointerEvent): { x: number; y: number } => {
    const rect = (ev.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  };

  const onMapDown = (ev: PointerEvent): void => {
    const view = useUi.getState().view;
    if (!view) return;
    ev.stopPropagation();
    clearHover();
    const { x, y } = mapAt(ev);
    const e = latest.current.extent;
    const box = minimapBox(view, e, MAP_W, MAP_H);
    const inside = x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
    mapGrab.current = inside ? { dx: x - box.x - box.w / 2, dy: y - box.y - box.h / 2 } : { dx: 0, dy: 0 };
    if (!inside) apply(centerFromMinimap(view, e, x, y, MAP_W, MAP_H));
    (ev.currentTarget as HTMLCanvasElement).setPointerCapture(ev.pointerId);
  };

  const onMapMove = (ev: PointerEvent): void => {
    const grab = mapGrab.current;
    const view = useUi.getState().view;
    if (!grab || !view) return;
    const { x, y } = mapAt(ev);
    apply(centerFromMinimap(view, latest.current.extent, x - grab.dx, y - grab.dy, MAP_W, MAP_H));
  };

  const onMapUp = (): void => {
    mapGrab.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      class="prc-map"
      style={{ width: MAP_W, height: MAP_H }}
      aria-hidden="true"
      onPointerDown={onMapDown}
      onPointerMove={onMapMove}
      onPointerUp={onMapUp}
      onPointerCancel={onMapUp}
    />
  );
}
