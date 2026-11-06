import { fmtMin, fmtWhen } from '../core/format';
import { columnStacks, rowStack, STACK_ORDER, visibleRows } from '../core/histogram';
import type { PieceKey, RowShape } from '../core/rowShape';
import { rowAt, timeAt } from '../core/view';
import type { PrRow } from '../core/derive';
import { useUi } from '../stores/ui';
import { HIST_BOTTOM, HIST_RIGHT } from './prHistCanvas';
import { pieceStyle } from './prTip';

interface Props {
  rightRef: { current: HTMLCanvasElement | null };
  bottomRef: { current: HTMLCanvasElement | null };
  latest: { current: { rows: PrRow[]; shapes: RowShape[] } };
  clearHover(): void;
}

export function PrHistograms({ rightRef, bottomRef, latest, clearHover }: Props) {
  const hoverColumn = (ev: PointerEvent): void => {
    const ui = useUi.getState();
    if (!ui.view) return;
    const x = Math.floor(ev.offsetX);
    const { counts } = columnStacks(latest.current.shapes, ui.view);
    const present = STACK_ORDER.filter((k: PieceKey) => counts[k][x]! > 0);
    if (!present.length) return clearHover();
    const inQueue = present.reduce((sum, k) => (k === 'gap' ? sum : sum + counts[k][x]!), 0);
    ui.moveTip(ev.clientX, ev.clientY);
    ui.setTip({
      head: [fmtWhen(timeAt(ui.view, x)), `${inQueue} PRs in the queue. Times are UTC.`],
      rows: present.map((k) => ({ value: String(counts[k][x]), ...pieceStyle(k) })),
    });
  };

  const hoverRow = (ev: PointerEvent): void => {
    const ui = useUi.getState();
    const { rows, shapes } = latest.current;
    if (!ui.view) return;
    const row = rowAt(ui.view, ev.offsetY);
    const { first, last } = visibleRows(ui.view, rows.length);
    if (row < first || row > last) return clearHover();
    const pr = rows[row]!.pr;
    const stack = rowStack(shapes[row]!, row);
    if (!stack.total) return clearHover();
    ui.moveTip(ev.clientX, ev.clientY);
    if (ui.hoveredPr !== pr) ui.setHoveredPr(pr);
    ui.setTip({
      head: [`PR #${pr}`, `${fmtMin(stack.total / 60e3)} in the queue`],
      rows: stack.parts.map((p) => ({ value: fmtMin(p.ms / 60e3), ...pieceStyle(p.key) })),
    });
  };

  return (
    <>
      <canvas
        ref={rightRef}
        class="prc-hist-right"
        style={{ width: HIST_RIGHT }}
        role="img"
        aria-label="Time in the queue for each visible pull request, split by stage."
        onPointerMove={hoverRow}
        onPointerLeave={clearHover}
      />
      <canvas
        ref={bottomRef}
        class="prc-hist-bottom"
        style={{ height: HIST_BOTTOM }}
        role="img"
        aria-label="Pull requests at each visible point in time, split by stage."
        onPointerMove={hoverColumn}
        onPointerLeave={clearHover}
      />
    </>
  );
}
