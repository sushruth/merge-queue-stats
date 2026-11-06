import type { GitHubClient } from './github';
import type { RepoRef } from './types';

const OPTION_CAP = 100;

export function filterOptions(options: string[], query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) => option.toLowerCase().includes(needle));
}

export function matchOption(options: string[], text: string): string | null {
  const needle = text.trim().toLowerCase();
  return options.find((option) => option.toLowerCase() === needle) ?? null;
}

export function mergeNames(first: string[], second: string[]): string[] {
  const seen = new Set<string>();
  return [...first, ...second].filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface LabelledWorkflow {
  id: number;
  label: string;
}

// GitHub allows two workflow files to share a name, and the field picks by label.
export function workflowLabels(workflows: { id: number; name: string }[]): LabelledWorkflow[] {
  const counts = new Map<string, number>();
  for (const { name } of workflows) counts.set(name, (counts.get(name) ?? 0) + 1);
  return workflows.map(({ id, name }) => ({ id, label: counts.get(name)! > 1 ? `${name} #${id}` : name }));
}

const REPOS_QUERY = `query ($first: Int!) {
  viewer {
    repositories(
      first: $first
      orderBy: { field: PUSHED_AT, direction: DESC }
      affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
      ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
    ) {
      nodes { nameWithOwner }
    }
  }
}`;

export async function fetchRepos(client: GitHubClient): Promise<string[]> {
  const data = await client.gql<{ viewer: { repositories: { nodes: { nameWithOwner: string }[] } } }>(REPOS_QUERY, {
    first: OPTION_CAP,
  });
  return data.viewer.repositories.nodes.map((node) => node.nameWithOwner);
}

const BRANCHES_QUERY = `query ($owner: String!, $name: String!, $first: Int!, $query: String) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name }
    refs(refPrefix: "refs/heads/", first: $first, query: $query) {
      pageInfo { hasNextPage }
      nodes { name }
    }
  }
}`;

interface BranchesData {
  repository: {
    defaultBranchRef: { name: string } | null;
    refs: { pageInfo: { hasNextPage: boolean }; nodes: { name: string }[] };
  };
}

export interface BranchPage {
  names: string[];
  truncated: boolean;
}

export async function fetchBranches(client: GitHubClient, repo: RepoRef, query = ''): Promise<BranchPage> {
  const { repository } = await client.gql<BranchesData>(BRANCHES_QUERY, {
    owner: repo.owner,
    name: repo.name,
    first: OPTION_CAP,
    query: query || null,
  });
  const preferred = repository.defaultBranchRef ? [repository.defaultBranchRef.name] : [];
  return {
    names: mergeNames(preferred, repository.refs.nodes.map((node) => node.name)),
    truncated: repository.refs.pageInfo.hasNextPage,
  };
}
