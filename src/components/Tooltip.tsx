import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { useUi } from '../stores/ui';

const TWO_COLUMNS_AFTER = 14;
const MARGIN = 8;
const OFFSET = 14;

export function Tooltip() {
  const tip = useUi((s) => s.tip);
  const ref = useRef<HTMLDivElement>(null);

  const place = (): void => {
    const el = ref.current;
    if (!el) return;
    const { tipX, tipY } = useUi.getState();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    let x = tipX + OFFSET;
    if (x + w > vw - MARGIN) x = tipX - OFFSET - w;
    let y = tipY + OFFSET;
    if (y + h > vh - MARGIN) y = vh - MARGIN - h;
    x = Math.max(MARGIN, x);
    y = Math.max(MARGIN, y);
    el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  };

  useLayoutEffect(place, [tip]);
  useEffect(() => useUi.subscribe((s, prev) => {
    if (s.tipX !== prev.tipX || s.tipY !== prev.tipY) place();
  }), []);

  if (!tip) return null;
  return (
    <div ref={ref} class={`tip${tip.rows.length > TWO_COLUMNS_AFTER ? ' tip-wide' : ''}`} role="status">
      {tip.head.map((line, i) => (
        <div key={i} class={i ? 'tip-sub' : 'tip-head'}>{line}</div>
      ))}
      <div class="tip-rows">
        {tip.rows.map((row, i) => (
          <div key={i} class={`tip-row${row.value === undefined ? ' tip-title' : ''}`}>
            {row.marked && <span class="tip-marker">▸</span>}
            {row.color && <i class="tip-key" style={{ background: row.color }} />}
            {row.value !== undefined && <b>{row.value}</b>}
            <span>{row.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
