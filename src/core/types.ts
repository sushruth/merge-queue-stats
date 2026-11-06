export interface RepoRef {
  owner: string;
  name: string;
}

export type AttemptRow = [start: number, end: number | null, outcome: string];

export interface Attempt {
  pr: number;
  start: number;
  end: number | null;
  outcome: string;
}

export interface QueueEvent {
  type: 'added' | 'removed' | 'merged';
  at: number;
  reason?: string | null;
}

export interface AttemptsCache {
  since?: number;
  prs: Record<string, AttemptRow[]>;
  backfillDone?: boolean;
  backfillStartedAt?: number;
  cursor?: string | null;
  watermark?: number;
}

export type RunRow = [
  workflowId: number,
  created: number,
  updated: number,
  started: number,
  conclusion: string | null,
  pr: number | null,
];

export interface Run {
  workflowId: number;
  created: number;
  updated: number;
  started: number;
  conclusion: string | null;
  pr: number | null;
}

export interface RunsCache {
  days: Record<string, RunRow[]>;
  workflows: Record<string, string>;
  truncatedDays: string[];
}

export interface LiveEntry {
  pos: number;
  state: string;
  at: number;
  eta: number | null;
  pr: number;
  title: string;
  author: string;
}

export type StageKind =
  | 'wait'
  | 'running'
  | 'passed'
  | 'failed'
  | 'cancelled'
  | 'after-passed'
  | 'after-failed';

export interface Stage {
  t0: number;
  t1: number;
  kind: StageKind;
}

export interface QueueSegment {
  i: number;
  pos: number;
  t0: number;
  t1: number;
}
