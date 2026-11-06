import { useRef } from 'preact/hooks';
import { niceScale } from '../core/derive';
import { useUi } from '../stores/ui';
import { Legend } from './Legend';
import { useWidth } from './util';

export interface Series {
  name: string;
  color: string;
  points: [number, number | null][];
}

interface Props {
  title: string;
  series: Series[];
  format: (v: number | null) => string;
  percent?: boolean;
  minutes?: boolean;
  xLabel: (t: number) => string;
  tipHead: (t: number) => string;
}

const HEIGHT = 170;
const M = { l: 38, r: 44, t: 8, b: 20 };
const END_LABEL_GAP = 12;

export function LineChart({ title, series, format, percent, minutes, xLabel, tipHead }: Props) {
  const [ref, measured] = useWidth<HTMLDivElement>();
  const hair = useRef<SVGLineElement>(null);
  const w = Math.max(measured, 240);
  const all = series.flatMap((s) => s.points).filter((p): p is [number, number] => p[1] !== null);
  const scale = percent ? { max: 100, step: 25 } : niceScale(Math.max(0, ...all.map((p) => p[1])), minutes);
  const y = (v: number): number => HEIGHT - M.b - (v / scale.max) * (HEIGHT - M.t - M.b);
  const ts = series[0]?.points.map((p) => p[0]) ?? [];
  const x0 = ts[0] ?? 0;
  const x1 = ts[ts.length - 1] ?? 0;
  const x = (t: number): number => M.l + (x1 === x0 ? 0.5 : (t - x0) / (x1 - x0)) * (w - M.l - M.r);
  const labelEvery = Math.max(1, Math.ceil(ts.length / Math.max(1, Math.floor((w - M.l - M.r) / 52))));
  const ticks: number[] = [];
  for (let v = 0; v <= scale.max; v += scale.step) ticks.push(v);

  const ends = series
    .map((s) => {
      const pts = s.points.filter((p): p is [number, number] => p[1] !== null);
      const last = pts[pts.length - 1];
      return last ? { name: s.name, value: last[1], x: x(last[0]), y: y(last[1]) + 4 } : null;
    })
    .filter((e) => e !== null)
    .sort((a, b) => a.y - b.y);
  ends.forEach((e, i) => {
    const prev = ends[i - 1];
    if (prev && e.y - prev.y < END_LABEL_GAP) e.y = prev.y + END_LABEL_GAP;
  });

  const onMove = (ev: PointerEvent): void => {
    if (!ts.length) return;
    const rect = (ev.currentTarget as SVGElement).getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const t = ts.reduce((best, c) => (Math.abs(x(c) - px) < Math.abs(x(best) - px) ? c : best), ts[0]!);
    const ui = useUi.getState();
    hair.current?.setAttribute('x1', String(x(t)));
    hair.current?.setAttribute('x2', String(x(t)));
    hair.current?.setAttribute('visibility', 'visible');
    ui.moveTip(ev.clientX, ev.clientY);
    ui.setTip({
      head: [tipHead(t)],
      rows: series.map((s) => ({
        value: format(s.points.find((p) => p[0] === t)?.[1] ?? null),
        label: s.name,
        color: s.color,
      })),
    });
  };
  const onLeave = (): void => {
    hair.current?.setAttribute('visibility', 'hidden');
    useUi.getState().setTip(null);
  };

  return (
    <div class="trend">
      <h3>{title}</h3>
      <div ref={ref}>
        {all.length ? (
          <svg width={w} height={HEIGHT} role="img" aria-label={title} onPointerMove={onMove} onPointerLeave={onLeave}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={M.l} x2={w - M.r} y1={y(v)} y2={y(v)} class="grid-hour" />
                <text x={M.l - 6} y={y(v) + 4} text-anchor="end" class="axis-hour">{format(v)}</text>
              </g>
            ))}
            {ts.map((t, i) =>
              (ts.length - 1 - i) % labelEvery === 0 ? (
                <text key={t} x={x(t)} y={HEIGHT - 4} text-anchor="middle" class="axis-hour">{xLabel(t)}</text>
              ) : null,
            )}
            {series.map((s) => {
              const pts = s.points.filter((p): p is [number, number] => p[1] !== null);
              const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join('');
              return (
                <g key={s.name}>
                  <path d={d} fill="none" stroke-width={2} stroke-linejoin="round" stroke-linecap="round" style={{ stroke: s.color }} />
                  {pts.map((p) => (
                    <circle key={p[0]} cx={x(p[0])} cy={y(p[1])} r={4} stroke-width={2} style={{ fill: s.color, stroke: 'var(--bg)' }} />
                  ))}
                </g>
              );
            })}
            {ends.map((e) => (
              <text key={e.name} x={e.x + 8} y={e.y} class="end-label">{format(e.value)}</text>
            ))}
            <line ref={hair} y1={M.t} y2={HEIGHT - M.b} visibility="hidden" class="hair" />
          </svg>
        ) : (
          <p class="quiet empty">No data yet.</p>
        )}
      </div>
      {series.length > 1 && <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} />}
    </div>
  );
}
