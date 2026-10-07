import type { Timestamp } from 'firebase/firestore';

/** Every time on the site is the city clock's zone (US Eastern unless an admin changes it). Live bindings: set once from the gang settings. */
export let TZ = 'America/New_York';
export let TZ_LABEL = 'ET';
/** Night on the map, in city hours. */
export let NIGHT = { from: 20, to: 6 };
export function setCityClock(zone?: string, label?: string, night?: { from: number; to: number }) {
  if (zone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
      TZ = zone;
    } catch {
      /* unknown zone: keep the old one */
    }
  }
  if (label) TZ_LABEL = label;
  if (night) NIGHT = night;
}

export const toDate = (t?: Timestamp | Date | null) => (t ? (t instanceof Date ? t : t.toDate()) : null);

export function fmtDate(t?: Timestamp | Date | null) {
  const d = toDate(t);
  return d ? d.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

export function fmtTime(t?: Timestamp | Date | null) {
  const d = toDate(t);
  return d ? `${d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })} ${TZ_LABEL}` : '';
}

export function ago(t?: Timestamp | Date | null) {
  const d = toDate(t);
  if (!d) return 'never';
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
}

export const initials = (name: string) =>
  name
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';
