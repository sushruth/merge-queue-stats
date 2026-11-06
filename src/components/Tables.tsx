import type { ComponentChildren } from 'preact';
import { OUTCOMES } from '../core/derive';
import { fmtDay, fmtMin, fmtPct } from '../core/format';
import { useData } from '../stores/data';
import type { Derived } from '../stores/derived';
import { useSettings } from '../stores/settings';

interface Column {
  label: string;
  num?: boolean;
  wide?: boolean;
}

function Table({ columns, rows }: { columns: Column[]; rows: ComponentChildren[][] }) {
  return (
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.label} class={c.num ? 'num' : undefined}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} class={columns[j]!.num ? 'num' : columns[j]!.wide ? 'wide' : undefined}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LiveTable({ now }: { now: number }) {
  const live = useData((s) => s.live);
  const repo = useSettings((s) => s.repo);
  return (
    <section class="section">
      <div class="section-head">
        <h2>In the queue now</h2>
        {live && <p class="quiet">{live.length} pull requests</p>}
      </div>
      {live?.length ? (
        <Table
          columns={[
            { label: '#' },
            { label: 'Pull request', wide: true },
            { label: 'Author' },
            { label: 'State' },
            { label: 'In queue', num: true },
            { label: "GitHub's estimate", num: true },
          ]}
          rows={live.map((e) => [
            e.pos,
            <a href={`https://github.com/${repo}/pull/${e.pr}`} target="_blank" rel="noopener noreferrer">
              #{e.pr} {e.title}
            </a>,
            e.author,
            e.state.toLowerCase().replace(/_/g, ' '),
            fmtMin((now - e.at) / 60e3),
            fmtMin((e.eta ?? 0) / 60),
          ])}
        />
      ) : (
        <p class="quiet empty">{live ? 'Nothing is in the queue right now.' : 'The queue has not been checked yet.'}</p>
      )}
    </section>
  );
}

export function HistoryTables({ derived: { weekly, days } }: { derived: Derived }) {
  return (
    <section class="section">
      <div class="section-head">
        <h2>By week</h2>
        <p class="quiet">Weeks start Monday UTC. The newest week is partial. Waits count merged attempts only.</p>
      </div>
      <Table
        columns={[
          { label: 'Week of' },
          { label: 'Attempts', num: true },
          { label: 'Merged', num: true },
          { label: 'Not merged', num: true },
          { label: 'Merge rate', num: true },
          { label: 'Median wait', num: true },
          { label: 'P90 wait', num: true },
          { label: 'Longest', num: true },
          { label: 'CI runs', num: true },
          { label: 'CI failed', num: true },
          { label: 'Median passing run', num: true },
        ]}
        rows={[...weekly].reverse().map((r) => [
          fmtDay(r.t),
          r.attempts,
          r.merged,
          r.notMerged,
          fmtPct(r.rate),
          fmtMin(r.p50),
          fmtMin(r.p90),
          fmtMin(r.max),
          r.runs,
          fmtPct(r.failRate),
          fmtMin(r.okP50),
        ])}
      />
      <details class="by-day">
        <summary>By day</summary>
        <Table
          columns={[
            { label: 'Day (UTC)' },
            ...OUTCOMES.map((o) => ({ label: o.label, num: true })),
            { label: 'Total', num: true },
          ]}
          rows={[...days].reverse().map((d) => [
            fmtDay(d.t),
            ...OUTCOMES.map((o) => d.counts[o.key] ?? 0),
            d.total,
          ])}
        />
      </details>
    </section>
  );
}
