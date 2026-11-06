import { fmtMin, fmtPct } from '../core/format';
import { weekKey } from '../core/stats';
import { DAY_MS } from '../core/attempts';
import { useData } from '../stores/data';
import type { Derived } from '../stores/derived';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div class="stat">
      <div class="stat-value">{value}</div>
      <div class="stat-label">{label}</div>
      {sub && <div class="stat-sub">{sub}</div>}
    </div>
  );
}

export function Stats({ derived: { weekly, now } }: { derived: Derived }) {
  const live = useData((s) => s.live);
  const cur = weekly.find((w) => w.week === weekKey(now));
  const prev = weekly.find((w) => w.week === weekKey(now - 7 * DAY_MS));
  const vs = (text: string): string | undefined => (prev && text !== '–' ? `${text} last week` : undefined);
  const oldest = live?.length ? Math.min(...live.map((e) => e.at)) : null;
  const lastEta = live?.length ? Math.max(...live.map((e) => e.eta ?? 0)) : null;

  return (
    <div class="stats">
      <Stat
        label="In queue now"
        value={live ? String(live.length) : '–'}
        sub={lastEta !== null ? `about ${fmtMin(lastEta / 60)} to clear` : undefined}
      />
      <Stat label="Longest in queue" value={oldest ? fmtMin((now - oldest) / 60e3) : '–'} />
      <Stat label="Median wait this week" value={fmtMin(cur?.p50)} sub={vs(fmtMin(prev?.p50))} />
      <Stat label="Merge rate this week" value={fmtPct(cur?.rate)} sub={vs(fmtPct(prev?.rate))} />
      <Stat label="Queue CI failed this week" value={fmtPct(cur?.failRate)} sub={vs(fmtPct(prev?.failRate))} />
      <Stat label="Median passing CI run" value={fmtMin(cur?.okP50)} sub={vs(fmtMin(prev?.okP50))} />
    </div>
  );
}
