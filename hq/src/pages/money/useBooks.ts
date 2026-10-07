import { collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { useCollection, useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import type { BookEntry, DuesPay, DuesSettings, DuesWeek, Goal, Payout, SpendRequest } from '../../lib/books';
import { db } from '../../lib/firebase';
import { useMoney } from '../../lib/money';
import type { RepTransfer } from '../../lib/types';

const ms = (t?: { toMillis(): number }) => t?.toMillis() ?? Date.now();

/** Everything the Money page reads, and the gang bank worked out in dirty and clean. */
export function useBooks() {
  const { me, can, isLead } = useHub();
  const treasury = can('money') || isLead;
  const m = useMoney();
  const book = useCollection<BookEntry>('gangBook', treasury);
  const payAllQ = useMemo(() => collection(db, 'payouts'), []);
  const payMineQ = useMemo(() => query(collection(db, 'payouts'), where('memberId', '==', me.id)), [me.id]);
  const payAll = useCollection<Payout>(payAllQ, treasury);
  const payMine = useCollection<Payout>(payMineQ, !treasury);
  const spendAllQ = useMemo(() => collection(db, 'spendRequests'), []);
  const spendMineQ = useMemo(() => query(collection(db, 'spendRequests'), where('by', '==', me.id)), [me.id]);
  const spendAll = useCollection<SpendRequest>(spendAllQ, treasury);
  const spendMine = useCollection<SpendRequest>(spendMineQ, !treasury);
  const goals = useCollection<Goal>('savingsGoals') ?? [];
  const duesSettings = useDoc<DuesSettings>('settings/dues');
  const weeks = useCollection<DuesWeek>('duesWeeks') ?? [];
  const duesPays = useCollection<DuesPay>('duesPay') ?? [];
  const transfers = useCollection<RepTransfer>('repTransfers') ?? [];

  return useMemo(() => {
    const entries = [...(book ?? [])].sort((a, b) => ms(b.at) - ms(a.at));
    const sum = (dir: 'in' | 'out', cash: 'dirty' | 'clean') => entries.filter((e) => e.dir === dir && e.cash === cash).reduce((t, e) => t + e.amount, 0);
    const duesIn = (cash: 'dirty' | 'clean') => duesPays.filter((p) => p.status === 'confirmed' && p.cash === cash).reduce((t, p) => t + p.amount, 0);
    const gangWashes = m.washReqs.filter((w) => w.memberId === 'gang' && w.status !== 'cancelled');
    const washedOut = gangWashes.reduce((t, w) => t + w.dirty, 0);
    const washedIn = gangWashes.filter((w) => w.status === 'done').reduce((t, w) => t + w.clean, 0);
    // Dirty: gang Narco sales (less what went to the team) and the old BlackMarket ledger, plus the books.
    const dirty = m.income - m.payouts - m.expenses + sum('in', 'dirty') - sum('out', 'dirty') + duesIn('dirty') - washedOut;
    const clean = sum('in', 'clean') - sum('out', 'clean') + duesIn('clean') + washedIn;
    return {
      ready: m.ready && (!treasury || !!book),
      treasury,
      m,
      entries,
      bank: { dirty, clean },
      washing: { out: washedOut - gangWashes.filter((w) => w.status === 'done').reduce((t, w) => t + w.dirty, 0) },
      payouts: [...((treasury ? payAll : payMine) ?? [])].sort((a, b) => ms(b.at) - ms(a.at)),
      spends: [...((treasury ? spendAll : spendMine) ?? [])].sort((a, b) => ms(b.at) - ms(a.at)),
      goals: [...goals].sort((a, b) => Number(!!a.done) - Number(!!b.done) || ms(a.at) - ms(b.at)),
      duesSettings: duesSettings ?? null,
      duesReady: duesSettings !== undefined,
      weeks: [...weeks].sort((a, b) => b.id.localeCompare(a.id)),
      duesPays,
      transfers,
    };
  }, [book, payAll, payMine, spendAll, spendMine, goals, duesSettings, weeks, duesPays, transfers, m, treasury]);
}
export type Books = ReturnType<typeof useBooks>;
