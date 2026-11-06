import { Trash } from '@phosphor-icons/react';
import { useMemo, useState } from 'preact/hooks';
import { workflowLabels } from '../core/options';
import { useAuth } from '../stores/auth';
import { useData } from '../stores/data';
import type { Derived } from '../stores/derived';
import { useOptions } from '../stores/options';
import { useSettings } from '../stores/settings';
import { Combobox } from './Combobox';

export function RepoControls({ derived }: { derived: Derived }) {
  const repo = useSettings((s) => s.repo);
  const branch = useSettings((s) => s.branch);
  const setRepo = useSettings((s) => s.setRepo);
  const setBranch = useSettings((s) => s.setBranch);
  const setWorkflow = useSettings((s) => s.setWorkflow);
  const repos = useOptions((s) => s.repos);
  const branches = useOptions((s) => s.branches);
  const loadRepos = useOptions((s) => s.loadRepos);
  const loadBranches = useOptions((s) => s.loadBranches);
  const searchBranches = useOptions((s) => s.searchBranches);
  const [note, setNote] = useState('');

  const workflows = useMemo(() => workflowLabels(derived.workflows), [derived.workflows]);
  const workflowNames = useMemo(() => workflows.map((w) => w.label), [workflows]);
  const currentWorkflow = workflows.find((w) => w.id === derived.workflow);

  const submitRepo = (text: string, explicit: boolean): void => {
    const value = text.trim();
    if (value.toLowerCase() === (repo ?? '').toLowerCase()) {
      setNote(explicit && value ? `Already showing ${value}.` : '');
      return;
    }
    setNote(setRepo(value || null) ? '' : 'Enter the repo as owner/name.');
  };
  const submitBranch = (text: string, explicit: boolean): void => {
    const value = text.trim();
    if (value === (branch ?? '')) {
      setNote(explicit && value ? `Already showing ${value}.` : '');
      return;
    }
    setNote('');
    setBranch(value || null);
  };
  const submitWorkflow = (label: string): void => {
    const picked = workflows.find((w) => w.label === label);
    if (picked && picked.id !== derived.workflow) setWorkflow(picked.id);
  };

  return (
    <>
      <Combobox
        label="Repo"
        placeholder="owner/name"
        value={repo ?? ''}
        options={repos}
        onOpen={loadRepos}
        onCommit={submitRepo}
      />
      <Combobox
        label="Branch"
        placeholder="default branch"
        value={branch ?? ''}
        options={branches}
        onOpen={loadBranches}
        onSearch={searchBranches}
        onCommit={submitBranch}
      />
      {workflows.length > 0 && (
        <Combobox
          label="Workflow"
          strict
          value={currentWorkflow?.label ?? ''}
          options={workflowNames}
          onCommit={submitWorkflow}
        />
      )}
      {note && <span class="note" role="alert">{note}</span>}
    </>
  );
}

export function ForgetToken() {
  const hasToken = useAuth((s) => s.token !== null);
  const clearToken = useAuth((s) => s.clearToken);
  if (!hasToken) return null;
  return (
    <button type="button" class="bare" aria-label="Forget token" title="Forget token" onClick={clearToken}>
      <Trash size={18} aria-hidden="true" />
    </button>
  );
}

export function TokenControls() {
  const hasToken = useAuth((s) => s.token !== null);
  const setToken = useAuth((s) => s.setToken);
  const saveResult = useAuth((s) => s.saveResult);
  const authError = useData((s) => s.authError);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');

  const submit = (ev: Event): void => {
    ev.preventDefault();
    const value = draft.trim();
    if (!value) {
      setNote('Paste a token first, then press Enter.');
      return;
    }
    setNote('');
    setDraft('');
    setToken(value);
  };

  if (hasToken && !authError && saveResult === 'ok') return null;
  return (
    <div class="token">
      {(!hasToken || authError) && (
        <form class="controls" onSubmit={submit}>
          <label class="field">
            <span>GitHub token</span>
            <input
              type="text"
              class="masked"
              size={36}
              spellcheck={false}
              autocomplete="off"
              autocapitalize="off"
              data-1p-ignore
              data-lpignore="true"
              value={draft}
              onInput={(ev) => setDraft(ev.currentTarget.value)}
            />
          </label>
          <button type="submit" class="bare">Use token</button>
        </form>
      )}
      {(!hasToken || authError) && (
        <p class="quiet">
          The token stays in this browser and only goes to api.github.com. It needs read access to the
          repo's pull requests, metadata and actions.
        </p>
      )}
      {saveResult !== 'ok' && hasToken && (
        <p class="note" role="alert">This browser could not store the token. It lasts until you reload.</p>
      )}
      {note && <p class="note" role="status">{note}</p>}
    </div>
  );
}
