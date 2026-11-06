import { DAY_MS } from './attempts';
import type { GitHubClient } from './github';
import type { RepoRef, Run, RunRow, RunsCache } from './types';

const PAGE_SIZE = 100;
const GITHUB_FILTERED_RESULT_CAP = 1000;

interface RunsPage {
  total_count: number;
  workflow_runs: {
    workflow_id: number;
    name: string | null;
    path?: string;
    head_branch: string | null;
    created_at: string;
    updated_at: string;
    run_started_at?: string | null;
    conclusion: string | null;
  }[];
}

const HEAD_BRANCH = /^gh-readonly-queue\/(.+)\/pr-(\d+)-[^/]+$/;

export function parseHeadBranch(head: string | null | undefined): { branch: string; pr: number } | null {
  const match = HEAD_BRANCH.exec(head ?? '');
  return match ? { branch: match[1]!, pr: Number(match[2]) } : null;
}

export const dayKey = (t: number): string => new Date(t).toISOString().slice(0, 10);

// Days older than yesterday are final. Yesterday stays open because runs cross midnight.
export async function syncRuns(
  api: GitHubClient,
  repo: RepoRef,
  branch: string,
  rs: RunsCache,
  since: number,
  onDay?: (day: string) => void,
): Promise<void> {
  const now = Date.now();
  const yesterday = dayKey(now - DAY_MS);
  for (let t = now; t >= since - DAY_MS; t -= DAY_MS) {
    const day = dayKey(t);
    if (rs.days[day] && day < yesterday) continue;
    const rows: RunRow[] = [];
    for (let page = 1; ; page++) {
      const res = await api.rest<RunsPage>(
        `/repos/${repo.owner}/${repo.name}/actions/runs?event=merge_group&created=${day}&per_page=${PAGE_SIZE}&page=${page}`,
      );
      for (const x of res.workflow_runs) {
        const head = parseHeadBranch(x.head_branch);
        if (head?.branch !== branch) continue;
        rs.workflows[x.workflow_id] = x.name ?? x.path ?? String(x.workflow_id);
        const created = Date.parse(x.created_at);
        rows.push([
          x.workflow_id,
          created,
          Date.parse(x.updated_at),
          x.run_started_at ? Date.parse(x.run_started_at) : created,
          x.conclusion,
          head.pr,
        ]);
      }
      if (res.total_count > GITHUB_FILTERED_RESULT_CAP && !rs.truncatedDays.includes(day)) {
        rs.truncatedDays.push(day);
      }
      if (!res.workflow_runs.length || page * PAGE_SIZE >= res.total_count) break;
    }
    rs.days[day] = rows;
    onDay?.(day);
  }
}

export interface WorkflowOption {
  id: number;
  name: string;
  runs: number;
  minutes: number;
}

export function workflowOptions(rs: RunsCache): WorkflowOption[] {
  const totals = new Map<number, { runs: number; minutes: number }>();
  for (const rows of Object.values(rs.days)) {
    for (const [id, , updated, started, conclusion] of rows) {
      if (conclusion === 'skipped') continue;
      const total = totals.get(id) ?? { runs: 0, minutes: 0 };
      total.runs++;
      total.minutes += Math.max(0, updated - started) / 60e3;
      totals.set(id, total);
    }
  }
  return [...totals]
    .map(([id, total]) => ({ id, ...total, name: rs.workflows[id] ?? String(id) }))
    .sort((a, b) => b.minutes - a.minutes || b.runs - a.runs || a.id - b.id);
}

export function effectiveWorkflow(rs: RunsCache, selected: number | null | undefined): number | null {
  const options = workflowOptions(rs);
  if (selected != null && options.some((o) => o.id === selected)) return selected;
  return options[0]?.id ?? null;
}

export function runsOfWorkflow(rs: RunsCache, workflowId: number | null): Run[] {
  const out: Run[] = [];
  for (const rows of Object.values(rs.days)) {
    for (const [id, created, updated, started, conclusion, pr] of rows) {
      if (id === workflowId && conclusion !== 'skipped') out.push({ workflowId: id, created, updated, started, conclusion, pr });
    }
  }
  return out;
}

export function runsByPr(runs: Run[]): Map<number, Run[]> {
  const out = new Map<number, Run[]>();
  for (const run of runs) {
    if (run.pr === null) continue;
    const list = out.get(run.pr);
    if (list) list.push(run);
    else out.set(run.pr, [run]);
  }
  return out;
}
