import type { Timestamp } from 'firebase/firestore';
import type { Currency, Member } from './types';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-US');

export function formatAmount(type: Currency, amount: number, signed = false) {
  const sign = signed && amount > 0 ? '+' : '';
  if (type === 'rep') return `${sign}${num.format(amount)} rep`;
  return sign + money.format(amount);
}

export const formatMoney = (n: number) => money.format(n);
export const formatNumber = (n: number) => num.format(n);

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

export const CURRENCY_META: Record<Currency, { label: string; color: string; bg: string }> = {
  clean: { label: 'Clean Money', color: 'text-clean', bg: 'bg-clean/10 border-clean/30' },
  dirty: { label: 'Dirty Money', color: 'text-dirty', bg: 'bg-dirty/10 border-dirty/30' },
  rep: { label: 'Gang Rep', color: 'text-rep', bg: 'bg-rep/10 border-rep/30' },
};
