import { useState } from 'preact/hooks';
import { resolveRange } from '../core/derive';
import { dayKey } from '../core/runs';
import { matchesRange } from '../core/view';
import { useSettings } from '../stores/settings';
import { useUi } from '../stores/ui';

export const PRESETS = [
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 42, label: '6 weeks' },
];

export function RangeControl({ since, now }: { since: number | null; now: number }) {
  const rangeFrom = useSettings((s) => s.rangeFrom);
  const rangeTo = useSettings((s) => s.rangeTo);
  const setRangeDays = useSettings((s) => s.setRangeDays);
  const setRangeCustom = useSettings((s) => s.setRangeCustom);
  const requestFrame = useUi((s) => s.requestFrame);
  const framedDays = useUi((s) => {
    const { view } = s;
    if (!view) return null;
    return PRESETS.find((p) => matchesRange(view, resolveRange(p.days, null, null, now)))?.days ?? null;
  });
  const [note, setNote] = useState('');

  const apply = (from: string | null, to: string | null): void => {
    if (from && to && from > to) {
      setNote('The from date must not be after the to date.');
      return;
    }
    setNote('');
    setRangeCustom(from, to);
    requestFrame();
  };

  return (
    <div class="controls range">
      {PRESETS.map((p) => (
        <button
          key={p.days}
          type="button"
          class={framedDays === p.days ? 'bare selected' : 'bare'}
          aria-pressed={framedDays === p.days}
          onClick={() => {
            setNote('');
            setRangeDays(p.days);
            requestFrame();
          }}
        >
          {p.label}
        </button>
      ))}
      <label class="field">
        <span>From</span>
        <input
          type="date"
          value={rangeFrom ?? ''}
          min={since ? dayKey(since) : undefined}
          max={dayKey(now)}
          onChange={(ev) => apply(ev.currentTarget.value || null, rangeTo)}
        />
      </label>
      <label class="field">
        <span>To</span>
        <input
          type="date"
          value={rangeTo ?? ''}
          min={since ? dayKey(since) : undefined}
          max={dayKey(now)}
          onChange={(ev) => apply(rangeFrom, ev.currentTarget.value || null)}
        />
      </label>
      {note && <span class="note" role="alert">{note}</span>}
    </div>
  );
}
