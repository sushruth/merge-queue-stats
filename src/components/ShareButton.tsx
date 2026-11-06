import { Check, ShareNetwork } from '@phosphor-icons/react';
import { useCopy, type CopyState } from './useCopy';

const LABEL: Record<CopyState, string> = {
  idle: 'Copy link to this view',
  copied: 'Link copied',
  failed: 'Could not copy. Use the address bar.',
};

export function ShareButton() {
  const [state, copy] = useCopy();

  return (
    <button type="button" class="bare" aria-label={LABEL[state]} title={LABEL[state]} onClick={() => copy(location.href)}>
      {state === 'copied' ? <Check size={18} aria-hidden="true" /> : <ShareNetwork size={18} aria-hidden="true" />}
      {state !== 'idle' && <span role="status">{state === 'copied' ? 'Copied' : LABEL.failed}</span>}
    </button>
  );
}
