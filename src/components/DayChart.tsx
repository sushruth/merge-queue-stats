import { useRef } from 'preact/hooks';
import { niceScale, OUTCOMES, type DayRow } from '../core/derive';
import { fmtDay } from '../core/format';
import { useUi } from '../stores/ui';
import { Legend } from './Legend';
import { useWidth } from './util';

const HEIGHT = 220;
const M = { l: 32, r: 8, t: 8, b: 22 };
const SPACER = 2;
const RADIUS = 4;
const LEGEND = OUTCOMES.map((o) => ({ label: o.label, color: o.color }));

export function DayChart({ days }: { days: DayRow[] }) {
  const [ref, measured] = useWidth<HTMLDivElement>();
  const band = useRef<SVGRectElement>(null);
  const w = Math.max(measured, 240);
  const scale = niceScale(Math.max(0, ...days.map((d) => d.total)));
  const y = (v: number): number => HEIGHT - M.b - (v / scale.max) * (HEIGHT - M.t - M.b);
  const step = (w - M.l - M.r) / Math.max(days.length, 1);
  const barW = Math.min(24, Math.max(2, step - SPACER));
  const ticks: number[] = [];
  for (let v = 0; v <= scale.max; v += scale.step) ticks.push(v);

  const columns = days.map((d, i) => {
    const left = M.l + step * i + (step - barW) / 2;
    const present = OUTCOMES.filter((o) => d.counts[o.key]);
    let v = 0;
    return present.map((o, j) => {
      const top = y(v + d.counts[o.key]!);
      const bottom = y(v);
      v += d.counts[o.key]!;
      const last = j === present.length - 1;
      const yTop = last ? top : top + SPACER;
      const h = Math.max(1, bottom - yTop);
      const r = last ? Math.min(RADIUS, barW / 2, h) : 0;
      const path = `M${left} ${yTop + h}V${yTop + r}Q${left} ${yTop} ${left + r} ${yTop}H${left + barW - r}Q${left + barW} ${yTop} ${left + barW} ${yTop + r}V${yTop + h}Z`;
      return <path key={`${i}-${o.key}`} d={path} style={{ fill: o.color }} />;
    });
  });

  const onMove = (ev: PointerEvent): void => {
    const rect = (ev.currentTarget as SVGElement).getBoundingClientRect();
    const i = Math.floor((ev.clientX - rect.left - M.l) / step);
    const d = days[i];
    if (!d) return onLeave();
    band.current?.setAttribute('x', String(M.l + step * i));
    band.current?.setAttribute('width', String(step));
    band.current?.setAttribute('visibility', 'visible');
    const ui = useUi.getState();
    ui.moveTip(ev.clientX, ev.clientY);
    ui.setTip({
      head: [`${fmtDay(d.t)} (UTC): ${d.total} attempts`],
      rows: OUTCOMES.filter((o) => d.counts[o.key]).map((o) => ({
        value: String(d.counts[o.key]),
        label: o.label,
        color: o.color,
      })),
    });
  };
  const onLeave = (): void => {
    band.current?.setAttribute('visibility', 'hidden');
    useUi.getState().setTip(null);
  };

  return (
    <section class="section">
      <div class="section-head">
        <h2>Attempts by enqueue day</h2>
        <p class="quiet">UTC, whole history</p>
      </div>
      <div ref={ref}>
        <svg width={w} height={HEIGHT} role="img" aria-label="Attempts by enqueue day" onPointerMove={onMove} onPointerLeave={onLeave}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={w - M.r} y1={y(v)} y2={y(v)} class="grid-hour" />
              <text x={M.l - 6} y={y(v) + 4} text-anchor="end" class="axis-hour">{v}</text>
            </g>
          ))}
          <rect ref={band} y={M.t} height={HEIGHT - M.t - M.b} visibility="hidden" class="hover-band" />
          {columns}
          {days.map((d, i) =>
            new Date(d.t).getUTCDay() === 1 ? (
              <text key={d.t} x={M.l + step * i + step / 2} y={HEIGHT - 6} text-anchor="middle" class="axis-hour">
                {fmtDay(d.t)}
              </text>
            ) : null,
          )}
        </svg>
      </div>
      <Legend items={LEGEND} />
    </section>
  );
}
