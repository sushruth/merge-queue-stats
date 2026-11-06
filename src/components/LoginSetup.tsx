import { CheckCircle } from '@phosphor-icons/react';
import { useEffect } from 'preact/hooks';
import { INSTALL_URL, loginUrl } from '../core/auth';
import { needsInstall, useAuth } from '../stores/auth';
import { useData } from '../stores/data';
import { useSettings } from '../stores/settings';

function InstallGuide({ className }: { className: string }) {
  const login = useAuth((s) => s.login);
  const owner = useAuth((s) => s.owner);
  const installCheck = useAuth((s) => s.installCheck);
  const recheckInstall = useAuth((s) => s.recheckInstall);

  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === 'visible') void recheckInstall();
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [recheckInstall]);

  const result = {
    idle: '',
    checking: 'Checking GitHub…',
    not_found: `GitHub does not show the app on ${owner ?? 'any of your accounts'} yet.`,
    failed: 'Could not reach the login service. Check again in a moment.',
  }[installCheck];

  return (
    <section class={className}>
      <h2>Install the usually-frustrated GitHub App</h2>
      <ol class="install-steps">
        <li>
          <span class="install-marker"><CheckCircle size={18} weight="fill" aria-hidden="true" /></span>
          <p>Signed in as {login}</p>
        </li>
        <li>
          <span class="install-marker" aria-hidden="true">2</span>
          <div class="install-action">
            <a class="primary" href={INSTALL_URL} target="_blank" rel="noreferrer">Install on GitHub</a>
            <p>
              {owner
                ? `Choose ${owner}, the account that owns the repo you are viewing.`
                : 'Choose the account or org that owns the repo you want to view.'}
            </p>
          </div>
        </li>
        <li>
          <span class="install-marker" aria-hidden="true">3</span>
          <div class="install-check">
            <p>Come back to this page. It moves on as soon as GitHub shows the app.</p>
            <p class="quiet">An org needs an owner's approval, so the page stays on this step until they approve.</p>
            <div>
              <button type="button" class="bare" onClick={() => void recheckInstall()}>Check again</button>
            </div>
            <p class={installCheck === 'failed' ? 'note' : 'quiet'} role="status">{result}</p>
          </div>
        </li>
      </ol>
    </section>
  );
}

export function LoginSetup({ compact }: { compact: boolean }) {
  const status = useAuth((s) => s.status);
  const owner = useAuth((s) => s.owner);
  const guide = useAuth(needsInstall);
  const hasToken = useAuth((s) => s.token !== null);
  const tokenError = useAuth((s) => s.tokenError);
  const requestToken = useAuth((s) => s.requestToken);
  const authError = useData((s) => s.authError);
  const repo = useSettings((s) => s.repo);
  const className = compact ? 'setup setup-compact' : 'setup';

  if (status === 'checking') return null;

  if (status === 'signed_in' && !authError) {
    if (guide) return <InstallGuide className={className} />;
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
