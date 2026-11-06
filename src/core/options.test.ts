import { describe, expect, it } from 'vitest';
import type { GitHubClient } from './github';
import { fetchBranches, fetchRepos, filterOptions, matchOption, mergeNames, workflowLabels } from './options';

function clientReturning(data: unknown): GitHubClient & { variables: Record<string, unknown>[] } {
  const variables: Record<string, unknown>[] = [];
  return {
    variables,
    gql: async <T,>(_query: string, vars: Record<string, unknown>) => {
      variables.push(vars);
      return data as T;
    },
    rest: () => Promise.reject(new Error('unused')),
  };
}

describe('filterOptions', () => {
  const options = ['acme/Widgets', 'acme/gears', 'other/widgets-api'];

  it('matches a case-insensitive substring', () => {
    expect(filterOptions(options, 'WIDGETS')).toEqual(['acme/Widgets', 'other/widgets-api']);
  });

  it('returns everything for blank text', () => {
    expect(filterOptions(options, '  ')).toEqual(options);
  });
});

describe('matchOption', () => {
  it('returns the listed spelling or null', () => {
    expect(matchOption(['Merge Queue'], ' merge queue ')).toBe('Merge Queue');
    expect(matchOption(['Merge Queue'], 'merge')).toBeNull();
  });
});

describe('mergeNames', () => {
  it('keeps order and drops case-insensitive repeats', () => {
    expect(mergeNames(['a/B', 'c/d'], ['a/b', 'e/f'])).toEqual(['a/B', 'c/d', 'e/f']);
  });
});

describe('workflowLabels', () => {
  it('adds the id only to names that repeat', () => {
    const labels = workflowLabels([
      { id: 1, name: 'CI' },
      { id: 2, name: 'CI' },
      { id: 3, name: 'Lint' },
    ]);
    expect(labels.map((w) => w.label)).toEqual(['CI #1', 'CI #2', 'Lint']);
  });
});

describe('fetches', () => {
  it('maps repositories to owner/name', async () => {
    const client = clientReturning({ viewer: { repositories: { nodes: [{ nameWithOwner: 'a/b' }] } } });
    expect(await fetchRepos(client)).toEqual(['a/b']);
    expect(client.variables[0]).toEqual({ first: 100 });
  });

  it('puts the default branch first and reports truncation', async () => {
    const client = clientReturning({
      repository: {
        defaultBranchRef: { name: 'main' },
        refs: { pageInfo: { hasNextPage: true }, nodes: [{ name: 'alpha' }, { name: 'main' }] },
      },
    });
    const page = await fetchBranches(client, { owner: 'a', name: 'b' }, 'al');
    expect(page).toEqual({ names: ['main', 'alpha'], truncated: true });
    expect(client.variables[0]).toMatchObject({ owner: 'a', name: 'b', first: 100, query: 'al' });
  });

  it('handles an empty repository', async () => {
    const client = clientReturning({
      repository: { defaultBranchRef: null, refs: { pageInfo: { hasNextPage: false }, nodes: [] } },
    });
    expect(await fetchBranches(client, { owner: 'a', name: 'b' })).toEqual({ names: [], truncated: false });
    expect(client.variables[0]?.query).toBeNull();
  });
});
