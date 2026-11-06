import { create } from 'zustand';
import { parseRepo, readSharedChoices, resolveSelection, selectionSearch } from '../core/repo';
import { readJson, SETTINGS_KEY, writeJson } from '../core/storage';

interface SavedSettings {
  repo: string | null;
  branch: string | null;
  workflowByRepo: Record<string, number>;
  rangeDays: number;
  rangeFrom: string | null;
  rangeTo: string | null;
  chartWidth: number | null;
  chartHeight: number;
}

export interface SettingsState extends SavedSettings {
  setRepo(repo: string | null, branch?: string | null): boolean;
  setBranch(branch: string | null): void;
  setWorkflow(workflowId: number): void;
  setRangeDays(days: number): void;
  setRangeCustom(from: string | null, to: string | null): void;
  setChartSize(width: number | null, height: number): void;
}

const DEFAULT_CHART_HEIGHT = 640;

const saved = readJson<Partial<SavedSettings>>(SETTINGS_KEY, {});
const search = typeof location === 'undefined' ? '' : location.search;
const initial = resolveSelection(search, { repo: saved.repo ?? null, branch: saved.branch ?? null });
const shared = readSharedChoices(search);
const sharedRange = shared.days !== null || shared.from !== null || shared.to !== null;
const sharedWorkflow = initial.repo && shared.workflow ? { [initial.repo.toLowerCase()]: shared.workflow } : {};

export const useSettings = create<SettingsState>((set) => ({
  ...initial,
  workflowByRepo: { ...saved.workflowByRepo, ...sharedWorkflow },
  rangeDays: shared.days ?? saved.rangeDays ?? 7,
  rangeFrom: sharedRange ? shared.from : (saved.rangeFrom ?? null),
  rangeTo: sharedRange ? shared.to : (saved.rangeTo ?? null),
  chartWidth: saved.chartWidth ?? null,
  chartHeight: saved.chartHeight ?? DEFAULT_CHART_HEIGHT,

  setRepo(repo, branch = null) {
    const value = repo?.trim() || null;
    if (value && !parseRepo(value)) return false;
    set({ repo: value, branch: value ? branch : null });
    return true;
  },
  setBranch: (branch) => set({ branch }),
  setWorkflow: (workflowId) =>
    set((s) =>
      s.repo ? { workflowByRepo: { ...s.workflowByRepo, [s.repo.toLowerCase()]: workflowId } } : s,
    ),
  setRangeDays: (rangeDays) => set({ rangeDays, rangeFrom: null, rangeTo: null }),
  setRangeCustom: (rangeFrom, rangeTo) => set({ rangeFrom, rangeTo }),
  setChartSize: (chartWidth, chartHeight) => set({ chartWidth, chartHeight }),
}));

export function selectedWorkflow(state: Pick<SettingsState, 'repo' | 'workflowByRepo'>): number | null {
  return state.repo ? (state.workflowByRepo[state.repo.toLowerCase()] ?? null) : null;
}

function syncUrl(state: SettingsState): void {
  if (typeof location === 'undefined' || typeof history === 'undefined') return;
  const next = selectionSearch(location.search, state, {
    workflow: selectedWorkflow(state),
    days: state.rangeDays,
    from: state.rangeFrom,
    to: state.rangeTo,
  });
  if (next !== location.search) history.replaceState(null, '', `${location.pathname}${next}${location.hash}`);
}

syncUrl(useSettings.getState());

useSettings.subscribe((state) => {
  const { repo, branch, workflowByRepo, rangeDays, rangeFrom, rangeTo, chartWidth, chartHeight } = state;
  writeJson(SETTINGS_KEY, { repo, branch, workflowByRepo, rangeDays, rangeFrom, rangeTo, chartWidth, chartHeight });
  syncUrl(state);
});
