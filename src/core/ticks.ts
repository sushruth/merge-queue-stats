import { DAY_MS } from './attempts';
import { fmtDay, fmtWeekday } from './format';
import { timeAt, type View } from './view';

const HOUR = 36e5;
const MIN_TICK_PX = 84;
const FIRST_MONDAY = 4 * DAY_MS;
const TICK_STEPS = [1, 3, 6, 12, 24, 48, 168, 336].map((h) => h * HOUR);

export interface Tick {
  t: number;
  major: boolean;
  label: string;
}

export function axisTicks(v: View): Tick[] {
  const step = TICK_STEPS.find((s) => s * v.pxPerMs >= MIN_TICK_PX) ?? TICK_STEPS[TICK_STEPS.length - 1]!;
  const weekly = step >= 7 * DAY_MS;
  const base = weekly ? FIRST_MONDAY : 0;
  const end = timeAt(v, v.width);
  const ticks: Tick[] = [];
  for (let t = Math.ceil((v.t0 - base) / step) * step + base; t < end; t += step) {
    const hours = new Date(t).getUTCHours();
    const major = hours === 0;
    const label = weekly
      ? fmtDay(t)
      : major
        ? fmtWeekday(t)
        : `${fmtDay(t)}, ${String(hours).padStart(2, '0')}:00`;
    ticks.push({ t, major, label });
  }
  return ticks;
}
