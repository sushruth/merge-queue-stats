import { Check, ShareNetwork } from '@phosphor-icons/react';
import { useEffect, useState } from 'preact/hooks';

type Copy = 'idle' | 'copied' | 'failed';

const LABEL: Record<Copy, string> = {
  idle: 'Copy link to this view',
  copied: 'Link copied',
  failed: 'Could not copy. Use the address bar.',
};

export function ShareButton() {
  const [copy, setCopy] = useState<Copy>('idle');

  useEffect(() => {
    if (copy === 'idle') return;
    const timer = setTimeout(() => setCopy('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copy]);

  const share = (): void => {
    navigator.clipboard.writeText(location.href).then(
      () => setCopy('copied'),
      () => setCopy('failed'),
    );
  };

  return (
    <button type="button" class="bare" aria-label={LABEL[copy]} title={LABEL[copy]} onClick={share}>
      {copy === 'copied' ? <Check size={18} aria-hidden="true" /> : <ShareNetwork size={18} aria-hidden="true" />}
      {copy !== 'idle' && <span role="status">{copy === 'copied' ? 'Copied' : LABEL.failed}</span>}
    </button>
  );
}
