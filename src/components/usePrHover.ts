import { useRef } from 'preact/hooks';
import type { PrRow } from '../core/derive';
import { hitTest } from '../core/view';
import { useUi } from '../stores/ui';
import { partKey, prTip } from './prTip';

export function usePrHover(
  canvasEl: { current: HTMLCanvasElement | null },
  latest: { current: { rows: PrRow[]; now: number } },
) {
  const lastPart = useRef('');

  const clearHover = (): void => {
    const ui = useUi.getState();
    lastPart.current = '';
    if (ui.hoveredPr !== null) ui.setHoveredPr(null);
    if (ui.tip) ui.setTip(null);
  };

  const hover = (clientX: number, clientY: number): boolean => {
    const canvas = canvasEl.current;
    const ui = useUi.getState();
    if (!canvas || !ui.view) return false;
    const rect = canvas.getBoundingClientRect();
    const { rows: r, now: n } = latest.current;
    const found = hitTest(ui.view, r, clientX - rect.left, clientY - rect.top, n);
    canvas.style.cursor = found ? 'pointer' : '';
    if (!found) {
      clearHover();
      return false;
    }
    ui.moveTip(clientX, clientY);
    const k = partKey(found.part, found.row.pr);
    if (k !== lastPart.current) {
      lastPart.current = k;
      if (ui.hoveredPr !== found.row.pr) ui.setHoveredPr(found.row.pr);
      ui.setTip(prTip(found.row, found.part, n));
    }
    return true;
  };

  return { hover, clearHover };
}
