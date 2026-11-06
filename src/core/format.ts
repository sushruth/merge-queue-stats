export const fmtMin = (m: number | null | undefined): string =>
  m == null ? '–' : m >= 60 ? `${+(m / 60).toFixed(1)}h` : `${Math.round(m)}m`;

export const fmtPct = (p: number | null | undefined): string => (p == null ? '–' : `${Math.round(p)}%`);

export const fmtDay = (t: number): string =>
  new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const fmtWeekday = (t: number): string =>
  new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export const fmtWhen = (t: number): string =>
  new Date(t).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });

export const fmtClock = (t: number): string =>
  new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
