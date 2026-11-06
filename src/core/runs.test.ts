import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from './github';
import { effectiveWorkflow, parseHeadBranch, runsOfWorkflow, syncRuns, workflowOptions } from './runs';
import type { RunsCache } from './types';

describe('parseHeadBranch', () => {
  it('parses a simple queue branch', () => {
    expect(parseHeadBranch('gh-readonly-queue/main/pr-42-abc123')).toEqual({ branch: 'main', pr: 42 });
  });

  it('keeps slashes in the branch name', () => {
    expect(parseHeadBranch('gh-readonly-queue/release/v2/pr-7-deadbeef')).toEqual({
      branch: 'release/v2',
      pr: 7,
    });
  });

  it('uses the last pr segment when the branch name looks like one', () => {
    expect(parseHeadBranch('gh-readonly-queue/x/pr-1-a/pr-2-b')).toEqual({ branch: 'x/pr-1-a', pr: 2 });
  });

  it('returns null for anything else', () => {
    expect(parseHeadBranch('feature/pr-42-abc')).toBeNull();
    expect(parseHeadBranch('main')).toBeNull();
    expect(parseHeadBranch(null)).toBeNull();
  });
});

const NOW = Date.parse('2026-06-10T12:00:00Z');

function run(workflowId: number, name: string) {
  return {
    workflow_id: workflowId,
    name,
    head_branch: 'gh-readonly-queue/main/pr-5-abc',
    created_at: '2026-06-10T01:00:00Z',
    updated_at: '2026-06-10T01:10:00Z',
    run_started_at: '2026-06-10T01:01:00Z',
    conclusion: 'success',
  };
}

describe('syncRuns', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the repo-level endpoint, skips final days and refetches today and yesterday', async () => {
    const paths: string[] = [];
    const api = {
      rest: async (path: string) => {
        paths.push(path);
        return { total_count: 1, workflow_runs: [run(11, 'CI')] };
      },
    } as unknown as GitHubClient;
    const rs: RunsCache = {
      days: { '2026-06-08': [], '2026-06-09': [] },
      workflows: {},
      truncatedDays: [],
    };
    await syncRuns(api, { owner: 'acme', name: 'widgets' }, 'main', rs, NOW - 2 * 864e5);
    expect(paths.map((p) => /created=([\d-]+)/.exec(p)![1])).toEqual([
      '2026-06-10',
      '2026-06-09',
      '2026-06-07',
    ]);
    expect(paths[0]).toContain('/repos/acme/widgets/actions/runs?event=merge_group');
    expect(rs.days['2026-06-10']![0]).toEqual([
      11,
      Date.parse('2026-06-10T01:00:00Z'),
      Date.parse('2026-06-10T01:10:00Z'),
      Date.parse('2026-06-10T01:01:00Z'),
      'success',
      5,
    ]);
    expect(rs.workflows[11]).toBe('CI');
  });

  it('keeps only runs whose queue branch is the selected one', async () => {
    const other = { ...run(22, 'Other'), head_branch: 'gh-readonly-queue/release/v2/pr-6-abc' };
    const notQueue = { ...run(33, 'Stray'), head_branch: 'feature/x' };
    const api = {
      rest: async () => ({ total_count: 3, workflow_runs: [run(11, 'CI'), other, notQueue] }),
    } as unknown as GitHubClient;
    const rs: RunsCache = { days: {}, workflows: {}, truncatedDays: [] };
    await syncRuns(api, { owner: 'a', name: 'b' }, 'main', rs, NOW + 864e5);
    expect(rs.days['2026-06-10']!.map((r) => r[5])).toEqual([5]);
    expect(rs.workflows).toEqual({ 11: 'CI' });
  });

  it('stops paging on an empty page and records a day past the GitHub result cap', async () => {
    let calls = 0;
    const api = {
      rest: async () => ({ total_count: 5000, workflow_runs: calls++ < 1 ? [run(1, 'A')] : [] }),
    } as unknown as GitHubClient;
    const rs: RunsCache = { days: {}, workflows: {}, truncatedDays: [] };
    await syncRuns(api, { owner: 'a', name: 'b' }, 'main', rs, NOW + 864e5);
    expect(calls).toBe(2);
    expect(rs.truncatedDays).toEqual(['2026-06-10']);
  });
});

describe('workflow default', () => {
  const m = 60e3;
  const rs: RunsCache = {
    days: {
      d1: [
        [1, 0, m, 0, 'success', 1],
        [1, 0, m, 0, 'success', 2],
        [1, 0, m, 0, 'success', 3],
        [2, 0, 30 * m, 0, 'failure', 1],
        [3, 0, 500 * m, 0, 'skipped', 1],
      ],
    },
    workflows: { 1: 'Fast', 2: 'Main', 3: 'Skipped' },
    truncatedDays: [],
  };

  it('picks the workflow with the most run minutes, not the most runs', () => {
    expect(effectiveWorkflow(rs, null)).toBe(2);
  });

  it('treats skipped runs as no run at all', () => {
    expect(workflowOptions(rs).map((o) => o.id)).toEqual([2, 1]);
    expect(runsOfWorkflow(rs, 3)).toEqual([]);
  });
});

describe('workflow selection', () => {
  const rs: RunsCache = {
    days: {
      d1: [
        [1, 0, 0, 0, 'success', 1],
        [2, 0, 0, 0, 'failure', 1],
      ],
      d2: [[2, 0, 0, 0, null, 2]],
    },
    workflows: { 1: 'Lint', 2: 'CI' },
    truncatedDays: [],
  };

  it('defaults to the workflow with the most runs', () => {
    expect(workflowOptions(rs).map((o) => [o.name, o.runs])).toEqual([
      ['CI', 2],
      ['Lint', 1],
    ]);
    expect(effectiveWorkflow(rs, null)).toBe(2);
  });

  it('keeps a known selection and ignores an unknown one', () => {
    expect(effectiveWorkflow(rs, 1)).toBe(1);
    expect(effectiveWorkflow(rs, 99)).toBe(2);
  });

  it('returns only the selected workflow', () => {
    expect(runsOfWorkflow(rs, 1).length).toBe(1);
    expect(runsOfWorkflow(rs, 2).map((r) => r.pr)).toEqual([1, 2]);
  });
});
