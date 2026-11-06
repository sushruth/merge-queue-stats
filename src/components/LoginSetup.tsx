import { INSTALL_URL, loginUrl } from '../core/auth';
import { isInstalled, useAuth } from '../stores/auth';
import { useData } from '../stores/data';
import { useSettings } from '../stores/settings';

export function LoginSetup({ compact }: { compact: boolean }) {
  const status = useAuth((s) => s.status);
  const owner = useAuth((s) => s.owner);
  const installed = useAuth(isInstalled);
  const hasToken = useAuth((s) => s.token !== null);
  const tokenError = useAuth((s) => s.tokenError);
  const requestToken = useAuth((s) => s.requestToken);
  const authError = useData((s) => s.authError);
  const repo = useSettings((s) => s.repo);
  const className = compact ? 'setup setup-compact' : 'setup';

  if (status === 'checking') return null;

  if (status === 'signed_in' && !authError) {
    if (!installed) {
      return (
        <section class={className}>
          <p>
            The usually-frustrated GitHub App is not installed on {owner ?? 'any of your accounts'}.{' '}
            <a href={INSTALL_URL} target="_blank" rel="noreferrer">Install it</a>, then reload this page.
          </p>
        </section>
      );
    }
    if (tokenError && !hasToken) {
      return (
        <p class="note" role="alert">
          Could not get a GitHub token for {owner}: {tokenError}.{' '}
          <button type="button" class="bare" onClick={() => void requestToken()}>Try again</button>
        </p>
      );
    }
    return null;
  }

  return (
    <section class={className}>
      <h2>{repo ? `See how the ${repo} merge queue is doing` : 'See how a merge queue is doing'}</h2>
      {status === 'unavailable' && (
        <p class="note" role="alert">Could not reach the login service. Reload to try again.</p>
      )}
      <div>
        <button type="button" class="bare" onClick={() => location.assign(loginUrl(location.href))}>
          Log in with GitHub
        </button>
      </div>
      <p class="quiet">The GitHub token stays in this page's memory and only goes to api.github.com.</p>
    </section>
  );
}
