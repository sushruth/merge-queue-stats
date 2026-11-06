import type { GitHubClient } from './github';
import type { LiveEntry, RepoRef } from './types';

const LIVE_QUERY = `query($owner:String!,$name:String!,$branch:String!){
  repository(owner:$owner,name:$name){
    mergeQueue(branch:$branch){
      entries(first:100){nodes{position state enqueuedAt estimatedTimeToMerge
        pullRequest{number title author{login}}}}
    }
  }
}`;

const DEFAULT_BRANCH_QUERY = `query($owner:String!,$name:String!){
  repository(owner:$owner,name:$name){defaultBranchRef{name}}
}`;

interface LiveData {
  repository: {
    mergeQueue: {
      entries: {
        nodes: {
          position: number;
          state: string;
          enqueuedAt: string;
          estimatedTimeToMerge: number | null;
          pullRequest: { number: number; title: string; author: { login: string } | null };
        }[];
      };
    } | null;
  };
}

export async function fetchLive(
  api: GitHubClient,
  repo: RepoRef,
  branch: string,
): Promise<LiveEntry[] | null> {
  const data = await api.gql<LiveData>(LIVE_QUERY, { owner: repo.owner, name: repo.name, branch });
  const queue = data.repository.mergeQueue;
  if (!queue) return null;
  return queue.entries.nodes.map((n) => ({
    pos: n.position,
    state: n.state,
    at: Date.parse(n.enqueuedAt),
    eta: n.estimatedTimeToMerge,
    pr: n.pullRequest.number,
    title: n.pullRequest.title,
    author: n.pullRequest.author?.login ?? 'ghost',
  }));
}

export async function fetchDefaultBranch(api: GitHubClient, repo: RepoRef): Promise<string | null> {
  const data = await api.gql<{ repository: { defaultBranchRef: { name: string } | null } }>(
    DEFAULT_BRANCH_QUERY,
    { owner: repo.owner, name: repo.name },
  );
  return data.repository.defaultBranchRef?.name ?? null;
}
