import { useSettings } from '../stores/settings';

const MIN_W = 320;
const MIN_H = 200;

export function startFrameResize(ev: PointerEvent, el: HTMLElement, horizontal: boolean, vertical: boolean): void {
  ev.preventDefault();
  const handle = ev.currentTarget as HTMLElement;
  const startX = ev.clientX;
  const startY = ev.clientY;
  const startW = el.offsetWidth;
  const startH = el.offsetHeight;
  const maxW = el.parentElement?.clientWidth ?? startW;
  const { setChartSize } = useSettings.getState();
  const onMove = (m: PointerEvent): void => {
    const s = useSettings.getState();
    const w = Math.max(MIN_W, Math.min(maxW, startW + m.clientX - startX));
    setChartSize(
      horizontal ? (w >= maxW ? null : w) : s.chartWidth,
      vertical ? Math.max(MIN_H, startH + m.clientY - startY) : s.chartHeight,
    );
  };
  const onUp = (): void => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
  handle.setPointerCapture(ev.pointerId);
}
