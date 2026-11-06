import { fmtClock, fmtDay } from '../core/format';
import { useAuth } from '../stores/auth';
import { useData } from '../stores/data';
import { usePhase, type Phase } from '../stores/phase';
import { useSettings } from '../stores/settings';

function phaseMessage(phase: Phase, repo: string | null, branch: string | null, until: number | null): string | null {
  switch (phase) {
    case 'needs_repo':
      return 'Enter a repo as owner/name to start.';
    case 'auth_error':
      return 'GitHub rejected the token from your login. Log in again below.';
    case 'rate_limited':
      return `GitHub's rate limit is used up.${until ? ` Checks resume after ${fmtClock(until)} UTC.` : ''}`;
    case 'repo_not_found':
      return `GitHub can't find ${repo}. It may not exist, or the usually-frustrated GitHub App may not have access to it.`;
    case 'empty_repo':
      return `${repo} has no default branch yet. Enter a branch.`;
    case 'no_queue':
      return `${repo} has no merge queue on ${branch}. Try another branch, or turn on the merge queue in its branch rules.`;
    case 'loading':
      return `Connecting to GitHub for ${repo}.`;
    default:
      return null;
  }
}

export function StatusFacts() {
  const progress = useData((s) => s.progress);
  const liveAt = useData((s) => s.liveAt);
  const rateInfo = useData((s) => s.rateInfo);
  const facts: string[] = [];
  if (progress?.phase === 'attempts') {
    facts.push(progress.oldest ? `Loading history, back to ${fmtDay(progress.oldest)}` : 'Loading history');
  } else if (progress?.phase === 'runs') {
    facts.push(`Loading CI runs, back to ${fmtDay(Date.parse(progress.day))}`);
  }
  if (liveAt) facts.push(`Checked ${fmtClock(liveAt)} UTC`);
  if (rateInfo.graphql) facts.push(`${rateInfo.graphql.remaining.toLocaleString('en-US')} GraphQL left`);
  if (rateInfo.rest) facts.push(`${rateInfo.rest.remaining.toLocaleString('en-US')} REST left`);
  const text = facts.join(' · ');
  return <p class="quiet status-facts" title={text} aria-live="polite">{text}</p>;
}

export function Status() {
  const phase = usePhase();
  const hasToken = useAuth((s) => s.token !== null);
  const repo = useSettings((s) => s.repo);
  const branch = useSettings((s) => s.branch);
  const rateLimitedUntil = useData((s) => s.rateLimitedUntil);
  const liveError = useData((s) => s.liveError);
  const historyError = useData((s) => s.historyError);
  const storageError = useData((s) => s.storageError);
  const truncated = useData((s) => s.runs.truncatedDays.length);

  const main = hasToken ? phaseMessage(phase, repo, branch, rateLimitedUntil) : null;

  const problems = [
    liveError && `Checking the queue failed: ${liveError}`,
    historyError && `Loading history failed: ${historyError}`,
    storageError && 'This browser could not save the history, so it reloads on the next visit.',
    truncated > 0 && `CI runs on ${truncated} busy days stop at GitHub's limit of 1,000 results per day.`,
  ].filter((p): p is string => !!p);

  return (
    <div class="status" aria-live="polite">
      {main && <p class="status-main">{main}</p>}
      {problems.map((p) => (
        <p key={p} class="note">{p}</p>
      ))}
    </div>
  );
}
