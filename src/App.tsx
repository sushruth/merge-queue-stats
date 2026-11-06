import { DAY_MS } from './core/attempts';
import { fmtDay, fmtMin, fmtPct } from './core/format';
import { Tooltip } from './components/Tooltip';
import { ForgetToken, RepoControls, TokenControls } from './components/Controls';
import { DayChart } from './components/DayChart';
import { LineChart } from './components/LineChart';
import { PrChart } from './components/PrChart';
import { ShareButton } from './components/ShareButton';
import { Stats } from './components/Stats';
import { Status } from './components/Status';
import { HistoryTables, LiveTable } from './components/Tables';
import { useData } from './stores/data';
import { useDerived } from './stores/derived';
import { usePhase } from './stores/phase';

const BOOKS =
  'M231.65,194.55,198.46,36.75a16,16,0,0,0-19-12.39L132.65,34.42a16.08,16.08,0,0,0-12.3,19l33.19,157.8A16,16,0,0,0,169.16,224a16.25,16.25,0,0,0,3.38-.36l46.81-10.06A16.09,16.09,0,0,0,231.65,194.55ZM136,50.15c0-.06,0-.09,0-.09l46.8-10,3.33,15.87L139.33,66Zm6.62,31.47,46.82-10.05,3.34,15.9L146,97.53Zm6.64,31.57,46.82-10.06,13.3,63.24-46.82,10.06ZM216,197.94l-46.8,10-3.33-15.87L212.67,182,216,197.85C216,197.91,216,197.94,216,197.94ZM104,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V48A16,16,0,0,0,104,32ZM56,48h48V64H56Zm0,32h48v96H56Zm48,128H56V192h48v16Z';

export function App() {
  const derived = useDerived();
  const phase = usePhase();
  const syncing = useData((s) => s.progress !== null);
  const lastSyncAt = useData((s) => s.lastSyncAt);
  const { attempts, weekly, days, now } = derived;
  const wk = (pick: (w: (typeof weekly)[number]) => number | null): [number, number | null][] =>
    weekly.map((w) => [w.t, pick(w)]);
  const weekHead = (t: number): string => `Week of ${fmtDay(t)} to ${fmtDay(t + 6 * DAY_MS)} (UTC)`;

  return (
    <main>
      <header>
        <h1>
          <svg width="22" height="22" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
            <path d={BOOKS} />
          </svg>
          Merge Queue Stats
        </h1>
        <RepoControls derived={derived} />
        <span class="header-actions">
          <ShareButton />
          <ForgetToken />
        </span>
      </header>
      <TokenControls />
      <Status />
      {attempts.length > 0 ? (
        <>
          <Stats derived={derived} />
          <PrChart derived={derived} />
          <DayChart days={days} />
          <section class="section">
            <h2>Trends by week</h2>
            <div class="trends">
              <LineChart
                title="Wait until merged"
                series={[
                  { name: 'Median', color: 'var(--s1)', points: wk((w) => w.p50) },
                  { name: 'P90', color: 'var(--s2)', points: wk((w) => w.p90) },
                ]}
                format={fmtMin}
                minutes
                xLabel={fmtDay}
                tipHead={weekHead}
              />
              <LineChart title="Merge rate" series={[{ name: 'Merge rate', color: 'var(--s1)', points: wk((w) => w.rate) }]} format={fmtPct} percent xLabel={fmtDay} tipHead={weekHead} />
              <LineChart title="Queue CI runs failed" series={[{ name: 'Failed', color: 'var(--s1)', points: wk((w) => w.failRate) }]} format={fmtPct} percent xLabel={fmtDay} tipHead={weekHead} />
              <LineChart title="Median passing CI run" series={[{ name: 'Median passing run', color: 'var(--s1)', points: wk((w) => w.okP50) }]} format={fmtMin} minutes xLabel={fmtDay} tipHead={weekHead} />
            </div>
          </section>
          <LiveTable now={now} />
          <HistoryTables derived={derived} />
        </>
      ) : (
        phase === 'ready' &&
        !syncing &&
        lastSyncAt && <p class="quiet empty">Nothing has gone through this merge queue in the last 6 weeks.</p>
      )}
      <Tooltip />
    </main>
  );
}
