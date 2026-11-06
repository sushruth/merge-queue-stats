import { useMemo } from 'preact/hooks';
import { flatten } from '../core/attempts';
import { dayRows, weeklyRows } from '../core/derive';
import { effectiveWorkflow, runsOfWorkflow, workflowOptions } from '../core/runs';
import { useData } from './data';
import { selectedWorkflow, useSettings } from './settings';

export function useDerived() {
  const attemptsCache = useData((s) => s.attempts);
  const runsCache = useData((s) => s.runs);
  const live = useData((s) => s.live);
  const liveAt = useData((s) => s.liveAt);
  const selected = useSettings(selectedWorkflow);

  return useMemo(() => {
    const now = Date.now();
    const liveSet = live ? new Set(live.map((e) => e.pr)) : null;
    const attempts = flatten(attemptsCache, liveSet);
    const workflow = effectiveWorkflow(runsCache, selected);
    const since = attemptsCache.since ?? 0;
    const runs = runsOfWorkflow(runsCache, workflow).filter((r) => r.created >= since);
    return {
      now,
      earliest: attemptsCache.since ?? null,
      attempts,
      runs,
      workflow,
      workflows: workflowOptions(runsCache),
      weekly: weeklyRows(attempts, runs),
      days: dayRows(attempts, now),
    };
  }, [attemptsCache, runsCache, live, liveAt, selected]);
}

export type Derived = ReturnType<typeof useDerived>;
