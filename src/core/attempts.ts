import type { GitHubClient } from './github';
import type { Attempt, AttemptRow, AttemptsCache, QueueEvent, RepoRef } from './types';

export const HISTORY_DAYS = 42;
export const DAY_MS = 864e5;
const WATERMARK_OVERLAP_MS = 5 * 60e3;

const PR_QUERY = `query($owner:String!,$name:String!,$after:String){
  repository(owner:$owner,name:$name){
    pullRequests(first:50,after:$after,orderBy:{field:UPDATED_AT,direction:DESC}){
      pageInfo{hasNextPage endCursor}
      nodes{number updatedAt
        timelineItems(last:60,itemTypes:[ADDED_TO_MERGE_QUEUE_EVENT,REMOVED_FROM_MERGE_QUEUE_EVENT,MERGED_EVENT]){
          nodes{__typename
            ... on AddedToMergeQueueEvent{createdAt}
            ... on RemovedFromMergeQueueEvent{createdAt reason}
            ... on MergedEvent{createdAt}
          }
        }
      }
    }
  }
}`;

interface TimelineItem {
  __typename: string;
  createdAt: string;
  reason?: string | null;
}

interface PrNode {
  number: number;
  updatedAt: string;
  timelineItems: { nodes: TimelineItem[] };
}

interface PrPage {
  repository: {
    pullRequests: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: PrNode[];
    };
  };
}

export function toAttempts(events: QueueEvent[]): AttemptRow[] {
  const out: AttemptRow[] = [];
  let open: number | null = null;
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    if (e.type === 'added') {
      if (open !== null) out.push([open, e.at, 're_added']);
      open = e.at;
    } else if (open !== null) {
      out.push([open, e.at, e.type === 'merged' ? 'merged' : e.reason || 'unknown']);
      open = null;
    }
  }
  if (open !== null) out.push([open, null, 'queued']);
  return out;
}

function eventsOf(node: PrNode): QueueEvent[] {
  return node.timelineItems.nodes.map((t) => ({
    type:
      t.__typename === 'AddedToMergeQueueEvent'
        ? 'added'
        : t.__typename === 'MergedEvent'
          ? 'merged'
          : 'removed',
    at: Date.parse(t.createdAt),
    reason: t.reason,
  }));
}

// A PR's whole timeline is refetched whenever it was updated, so a closed attempt in the cache is safe to keep.
export async function syncAttempts(
  api: GitHubClient,
  repo: RepoRef,
  st: AttemptsCache,
  onPage?: (oldest: number | null, backfilling: boolean) => void,
): Promise<void> {
  const started = Date.now();
  st.since ??= started - HISTORY_DAYS * DAY_MS;
  const backfilling = !st.backfillDone;
  if (backfilling) st.backfillStartedAt ??= started;
  const stopAt = backfilling ? st.since : (st.watermark ?? st.since) - WATERMARK_OVERLAP_MS;
  let after = backfilling ? (st.cursor ?? null) : null;
  let reached = false;
  while (!reached) {
    const data = await api.gql<PrPage>(PR_QUERY, { owner: repo.owner, name: repo.name, after });
    const page = data.repository.pullRequests;
    let oldest: number | null = null;
    for (const node of page.nodes) {
      oldest = Date.parse(node.updatedAt);
      if (oldest < stopAt) {
        reached = true;
        break;
      }
      const attempts = toAttempts(eventsOf(node));
      if (attempts.length) st.prs[node.number] = attempts;
    }
    if (!page.pageInfo.hasNextPage) reached = true;
    after = page.pageInfo.endCursor;
    if (backfilling) st.cursor = after;
    onPage?.(oldest, backfilling);
  }
  if (backfilling) {
    st.backfillDone = true;
    st.watermark = st.backfillStartedAt;
    delete st.cursor;
    delete st.backfillStartedAt;
  } else {
    st.watermark = started;
  }
}

export function flatten(st: AttemptsCache, liveSet?: Set<number> | null): Attempt[] {
  const out: Attempt[] = [];
  for (const [pr, list] of Object.entries(st.prs)) {
    for (const [start, end, outcome] of list) {
      if (st.since !== undefined && start < st.since) continue;
      if (end === null && liveSet && !liveSet.has(Number(pr))) continue;
      out.push({ pr: Number(pr), start, end, outcome });
    }
  }
  return out;
}
