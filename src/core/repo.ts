import type { RepoRef } from './types';

const REPO = /^[\w.-]+\/[\w.-]+$/;

export function parseRepo(value: string | null | undefined): RepoRef | null {
  const trimmed = value?.trim() ?? '';
  if (!REPO.test(trimmed)) return null;
  const [owner, name] = trimmed.split('/');
  return { owner: owner!, name: name! };
}

export interface Selection {
  repo: string | null;
  branch: string | null;
}

export function resolveSelection(search: string, saved: Selection): Selection {
  const params = new URLSearchParams(search);
  const urlRepo = parseRepo(params.get('repo')) ? params.get('repo')!.trim() : null;
  const urlBranch = params.get('branch')?.trim() || null;
  if (!urlRepo) return { repo: saved.repo, branch: saved.repo ? (urlBranch ?? saved.branch) : null };
  const sameRepo = saved.repo?.toLowerCase() === urlRepo.toLowerCase();
  return { repo: urlRepo, branch: urlBranch ?? (sameRepo ? saved.branch : null) };
}

export interface SharedChoices {
  workflow: number | null;
  days: number | null;
  from: string | null;
  to: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function positiveInt(value: string | null): number | null {
  return value && /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

export function readSharedChoices(search: string): SharedChoices {
  const params = new URLSearchParams(search);
  const date = (name: string): string | null => {
    const value = params.get(name);
    return value && DATE.test(value) ? value : null;
  };
  const from = date('from');
  const to = date('to');
  const inverted = from !== null && to !== null && from > to;
  return {
    workflow: positiveInt(params.get('workflow')),
    days: positiveInt(params.get('days')),
    from: inverted ? null : from,
    to: inverted ? null : to,
  };
}

export function selectionSearch(
  search: string,
  { repo, branch }: Selection,
  { workflow, days, from, to }: Partial<SharedChoices> = {},
): string {
  const params = new URLSearchParams(search);
  const put = (name: string, value: string | number | null | undefined): void => {
    if (value) params.set(name, String(value));
    else params.delete(name);
  };
  put('repo', repo);
  put('branch', repo && branch);
  put('workflow', repo && workflow);
  put('days', from || to ? null : days);
  put('from', from);
  put('to', to);
  const query = params.toString();
  return query ? `?${query}` : '';
}
