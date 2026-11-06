import { Check, Copy } from '@phosphor-icons/react';
import { useState } from 'preact/hooks';
import { useAuth } from '../stores/auth';
import { useData } from '../stores/data';
import { useSettings } from '../stores/settings';
import { useCopy } from './useCopy';

const FINE_GRAINED_URL = 'https://github.com/settings/personal-access-tokens/new';

function tokenCommand(userAgent: string): string {
  if (/Mac/.test(userAgent)) return 'gh auth token | pbcopy';
  if (/Win/.test(userAgent)) return 'gh auth token | clip';
  return 'gh auth token | xclip -selection clipboard';
}

export function TokenSetup({ compact }: { compact: boolean }) {
  const hasToken = useAuth((s) => s.token !== null);
  const setToken = useAuth((s) => s.setToken);
  const saveResult = useAuth((s) => s.saveResult);
  const authError = useData((s) => s.authError);
  const repo = useSettings((s) => s.repo);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [copyState, copy] = useCopy();
  const command = tokenCommand(navigator.userAgent);

  const use = (value: string): void => {
    const token = value.trim();
    setNote(token ? '' : 'Paste a token first, then press Enter.');
    setDraft('');
    if (token) setToken(token);
  };

  if (hasToken && !authError) {
    return saveResult === 'ok' ? null : (
      <p class="note" role="alert">This browser could not store the token. It lasts until you reload.</p>
    );
  }

  return (
    <section class={compact ? 'setup setup-compact' : 'setup'}>
      <h2>{repo ? `See how the ${repo} merge queue is doing` : 'See how a merge queue is doing'}</h2>
      <div class="setup-step">
        <span class="quiet">Copy your GitHub token in a terminal</span>
        <div class="setup-command">
          <code>{command}</code>
          <button
            type="button"
            class="bare"
            aria-label={copyState === 'copied' ? 'Command copied' : 'Copy command'}
            title={copyState === 'failed' ? 'Could not copy. Select the command instead.' : 'Copy command'}
            onClick={() => copy(command)}
          >
            {copyState === 'copied' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <form
        class="setup-step"
        onSubmit={(ev) => {
          ev.preventDefault();
          use(draft);
        }}
      >
        <label class="quiet" for="token">Paste it here</label>
        <input
          id="token"
          type="text"
          class="masked"
          spellcheck={false}
          autocomplete="off"
          autocapitalize="off"
          data-1p-ignore
          data-lpignore="true"
          value={draft}
          onInput={(ev) => setDraft(ev.currentTarget.value)}
          onPaste={(ev) => {
            const pasted = ev.clipboardData?.getData('text');
            if (!pasted) return;
            ev.preventDefault();
            use(pasted);
          }}
        />
        {note && <p class="note" role="status">{note}</p>}
      </form>
      <p class="quiet">
        The token stays in this browser and only goes to api.github.com. It has the same access as your gh login. For
        read-only access, <a href={FINE_GRAINED_URL} target="_blank" rel="noreferrer">create a fine-grained token</a>{' '}
        that can read pull requests, metadata and actions.
      </p>
    </section>
  );
}
