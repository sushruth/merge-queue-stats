import { describe, expect, it } from 'vitest';
import { parseRepo, readSharedChoices, resolveSelection, selectionSearch } from './repo';

const none = { repo: null, branch: null };

describe('selection', () => {
  it('accepts first run with nothing set', () => {
    expect(resolveSelection('', none)).toEqual(none);
  });

  it('prefers the URL and keeps a branch with a slash', () => {
    expect(resolveSelection('?repo=acme/widgets&branch=release/v2', { repo: 'x/y', branch: 'main' })).toEqual({
      repo: 'acme/widgets',
      branch: 'release/v2',
    });
  });

  it('does not reuse a saved branch for a different repo', () => {
    expect(resolveSelection('?repo=acme/widgets', { repo: 'x/y', branch: 'main' }).branch).toBeNull();
    expect(resolveSelection('?repo=x/Y', { repo: 'x/y', branch: 'main' }).branch).toBe('main');
  });

  it('falls back to saved settings for an invalid URL repo', () => {
    expect(resolveSelection('?repo=nope', { repo: 'x/y', branch: 'main' }).repo).toBe('x/y');
    expect(parseRepo('a/b/c')).toBeNull();
  });

  it('writes the selection and keeps other params', () => {
    expect(selectionSearch('?a=1', { repo: 'x/y', branch: 'main' })).toBe('?a=1&repo=x%2Fy&branch=main');
    expect(selectionSearch('?repo=x/y&branch=main', none)).toBe('');
  });

  it('round-trips workflow and range through the query string', () => {
    const repo = { repo: 'x/y', branch: 'main' };
    const preset = selectionSearch('', repo, { workflow: 12, days: 42, from: null, to: null });
    expect(readSharedChoices(preset)).toEqual({ workflow: 12, days: 42, from: null, to: null });
    const custom = selectionSearch(preset, repo, { workflow: null, days: 42, from: '2026-10-01', to: '2026-10-09' });
    expect(readSharedChoices(custom)).toEqual({ workflow: null, days: null, from: '2026-10-01', to: '2026-10-09' });
  });

  it('ignores bad shared values', () => {
    expect(readSharedChoices('?workflow=abc&days=-3&from=soon')).toEqual({ workflow: null, days: null, from: null, to: null });
    expect(readSharedChoices('?from=2026-10-09&to=2026-10-01')).toMatchObject({ from: null, to: null });
  });
});
