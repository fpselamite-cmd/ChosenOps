import type { Timestamp } from 'firebase/firestore';
import type { Member } from './types';

export function formatDate(ts?: Timestamp | null, withTime = false) {
  if (!ts) return '—';
  const d = ts.toDate();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

export function timeAgo(ts?: Timestamp | null) {
  if (!ts) return 'just now';
  const s = Math.round((Date.now() - ts.toMillis()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return formatDate(ts);
}

export const displayName = (m?: Member | null) => m?.character?.characterName?.trim() || m?.username || 'Unknown';

/** Plain-text preview of markdown lore: strips syntax, links and mentions. */
export function excerpt(markdown: string, length = 180) {
  const text = markdown
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t, label) => label || t)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > length ? text.slice(0, length).replace(/\s+\S*$/, '') + '…' : text;
}

/** Year part of a YYYY-MM-DD in-world date (may be negative or long, e.g. "-0300"). */
export const yearOf = (when: string) => when.replace(/-\d{2}-\d{2}$/, '');
