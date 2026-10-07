import type { DuesAmounts, DuesPay, DuesWeek } from '../../lib/books';
import type { RepTransfer } from '../../lib/types';

export type DueKind = keyof DuesAmounts;
export const KINDS: DueKind[] = ['rep', 'clean', 'dirty'];
export type DueState = 'confirmed' | 'waiting' | 'partial' | 'owed' | 'excused' | 'none';

/** Paid toward one dinner: confirmed and still waiting, per member and kind. */
export function paidFor(week: string, memberId: string, kind: DueKind, transfers: RepTransfer[], pays: DuesPay[]) {
  if (kind === 'rep') {
    const mine = transfers.filter((t) => t.dues === week && t.memberId === memberId);
    return { ok: mine.filter((t) => t.status === 'confirmed').reduce((s, t) => s + t.amount, 0), waiting: mine.filter((t) => t.status === 'pending').reduce((s, t) => s + t.amount, 0) };
  }
  const mine = pays.filter((p) => p.week === week && p.memberId === memberId && p.cash === kind);
  return { ok: mine.filter((p) => p.status === 'confirmed').reduce((s, p) => s + p.amount, 0), waiting: mine.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount, 0) };
}

export function stateOf(w: DuesWeek, memberId: string, kind: DueKind, transfers: RepTransfer[], pays: DuesPay[]): { state: DueState; owe: number; ok: number; waiting: number } {
  const owe = w.owe?.[memberId]?.[kind] ?? 0;
  const { ok, waiting } = paidFor(w.id, memberId, kind, transfers, pays);
  if (w.excused?.[memberId]) return { state: 'excused', owe, ok, waiting };
  if (!owe) return { state: 'none', owe, ok, waiting };
  if (ok >= owe) return { state: 'confirmed', owe, ok, waiting };
  if (waiting > 0) return { state: 'waiting', owe, ok, waiting };
  return { state: ok > 0 ? 'partial' : 'owed', owe, ok, waiting };
}

/** What someone still owes from dinners before `before` (excused dinners don't count). */
export function owedBefore(weeks: DuesWeek[], memberId: string, before: string, transfers: RepTransfer[], pays: DuesPay[]) {
  const out: DuesAmounts = { rep: 0, clean: 0, dirty: 0 };
  weeks
    .filter((w) => w.id < before && w.owe?.[memberId] && !w.excused?.[memberId])
    .forEach((w) =>
      KINDS.forEach((k) => {
        const { ok, waiting } = paidFor(w.id, memberId, k, transfers, pays);
        out[k] += Math.max(0, (w.owe[memberId]?.[k] ?? 0) - ok - waiting);
      }),
    );
  return out;
}

/** Everything someone has given: all rep they've sent the family, and dues cash. */
export function lifetime(memberId: string, transfers: RepTransfer[], pays: DuesPay[]): DuesAmounts {
  return {
    rep: transfers.filter((t) => t.memberId === memberId && t.status === 'confirmed').reduce((s, t) => s + t.amount, 0),
    clean: pays.filter((p) => p.memberId === memberId && p.cash === 'clean' && p.status === 'confirmed').reduce((s, p) => s + p.amount, 0),
    dirty: pays.filter((p) => p.memberId === memberId && p.cash === 'dirty' && p.status === 'confirmed').reduce((s, p) => s + p.amount, 0),
  };
}

export const fmtDue = (k: DueKind, v: number) => (k === 'rep' ? v.toLocaleString('en-US') : v >= 1000 ? `$${+(v / 1000).toFixed(1)}k` : `$${v}`);
