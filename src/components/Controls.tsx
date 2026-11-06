import { SignOut } from '@phosphor-icons/react';
import { useMemo, useState } from 'preact/hooks';
import { workflowLabels } from '../core/options';
import { useAuth } from '../stores/auth';
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

export function LogOut() {
  const signedIn = useAuth((s) => s.status === 'signed_in');
  const logOut = useAuth((s) => s.logOut);
  if (!signedIn) return null;
  return (
    <button type="button" class="bare" aria-label="Log out" title="Log out" onClick={() => void logOut()}>
      <SignOut size={18} aria-hidden="true" />
    </button>
  );
}
