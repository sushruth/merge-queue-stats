import { useEffect, useState } from 'preact/hooks';

export type CopyState = 'idle' | 'copied' | 'failed';

export function useCopy(): [CopyState, (text: string) => void] {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = (text: string): void => {
    navigator.clipboard.writeText(text).then(
      () => setState('copied'),
      () => setState('failed'),
    );
  };

  return [state, copy];
}
