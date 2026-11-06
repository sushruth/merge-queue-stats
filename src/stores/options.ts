import { create } from 'zustand';
import { createClient } from '../core/github';
import { fetchBranches, fetchRepos, mergeNames } from '../core/options';
import { parseRepo } from '../core/repo';
import { cachedRepos } from '../core/storage';
import { useAuth } from './auth';
import { useSettings } from './settings';

const SEARCH_DEBOUNCE_MS = 250;

export interface OptionsState {
  repos: string[];
  branches: string[];
  loadRepos(): void;
  loadBranches(): void;
  searchBranches(query: string): void;
}

let reposRun = 0;
let reposRequested = false;
let branchRun = 0;
let branchesRequestedFor: string | null = null;
let branchesTruncated = false;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function client() {
  const { token } = useAuth.getState();
  return token ? createClient({ token }) : null;
}

function usedRepos(): string[] {
  return mergeNames(Object.keys(useSettings.getState().workflowByRepo), cachedRepos());
}

export const useOptions = create<OptionsState>((set, get) => ({
  repos: [],
  branches: [],

  loadRepos() {
    const github = client();
    if (!github || reposRequested) return;
    reposRequested = true;
    const run = ++reposRun;
    set({ repos: usedRepos() });
    fetchRepos(github)
      .then((repos) => {
        if (run === reposRun) set({ repos: mergeNames(repos, usedRepos()) });
      })
      .catch(() => {
        if (run === reposRun) reposRequested = false;
      });
  },

  loadBranches() {
    const repoName = useSettings.getState().repo;
    const repo = parseRepo(repoName);
    const github = client();
    if (!repo || !github || branchesRequestedFor === repoName) return;
    branchesRequestedFor = repoName;
    const run = ++branchRun;
    fetchBranches(github, repo)
      .then((page) => {
        if (run !== branchRun) return;
        branchesTruncated = page.truncated;
        set({ branches: page.names });
      })
      .catch(() => {
        if (run === branchRun) branchesRequestedFor = null;
      });
  },

  searchBranches(query) {
    clearTimeout(searchTimer);
    const text = query.trim();
    const repo = parseRepo(useSettings.getState().repo);
    const github = client();
    if (!text || !repo || !github || !branchesTruncated) return;
    searchTimer = setTimeout(() => {
      const run = ++branchRun;
      fetchBranches(github, repo, text)
        .then((page) => {
          if (run === branchRun) set({ branches: mergeNames(get().branches, page.names) });
        })
        .catch(() => undefined);
    }, SEARCH_DEBOUNCE_MS);
  },
}));

function resetBranches(): void {
  clearTimeout(searchTimer);
  branchRun++;
  branchesRequestedFor = null;
  branchesTruncated = false;
  useOptions.setState({ branches: [] });
}

let lastRepo = useSettings.getState().repo?.toLowerCase();
useSettings.subscribe(({ repo }) => {
  if (repo?.toLowerCase() === lastRepo) return;
  lastRepo = repo?.toLowerCase();
  resetBranches();
  useOptions.getState().loadBranches();
});

let lastToken = useAuth.getState().token;
useAuth.subscribe(({ token }) => {
  if (token === lastToken) return;
  lastToken = token;
  reposRun++;
  reposRequested = false;
  useOptions.setState({ repos: [] });
  resetBranches();
});
