import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { Thing } from './locker';

/**
 * Trades between members. The sender's things leave their locker when they offer (held in the
 * trade). The other side can accept as is, decline, or counter with things and cash of their own;
 * then the sender confirms or declines. Each side picks up what's theirs when they next open their
 * locker. Cash moves between members' BlackMarket balances (dirty or clean) when a trade is done.
 */
export type TradeStatus2 = 'pending' | 'countered' | 'done' | 'declined' | 'cancelled';
export interface Cash {
  dirty: number;
  clean: number;
}
export interface Trade2 {
  id: string;
  v: 2;
  from: string;
  fromName: string;
  fromStorage: string;
  to: string;
  toName: string;
  things: Thing[];
  cash: Cash;
  note?: string;
  status: TradeStatus2;
  /** What the other side gives back, when they counter. */
  back?: Thing[];
  backCash?: Cash;
  backStorage?: string;
  /** Their one-line answer. */
  reply?: string;
  toCollected?: boolean;
  fromCollected?: boolean;
  giveReturned?: boolean;
  backReturned?: boolean;
  at?: Timestamp;
  closedAt?: Timestamp;
}

export interface CashMove {
  id: string;
  tradeId: string;
  from: string;
  to: string;
  dirty: number;
  clean: number;
  at?: Timestamp;
}

export const NO_CASH: Cash = { dirty: 0, clean: 0 };
export const hasCash = (c?: Cash) => !!c && (c.dirty > 0 || c.clean > 0);
export const cashText = (c?: Cash) =>
  [c?.dirty ? `$${c.dirty.toLocaleString('en-US')} dirty` : '', c?.clean ? `$${c.clean.toLocaleString('en-US')} clean` : ''].filter(Boolean).join(' + ');
/** What's in a trade. Without the Narco role drugs read as "product". */
export const thingsText = (t?: Thing[], narco = true) => (t ?? []).map((x) => `${x.qty} × ${narco || x.item ? x.label : 'product'}`).join(', ');

export const createTrade = (t: Omit<Trade2, 'id' | 'v' | 'status' | 'at'>) => addDoc(collection(db, 'trades'), { ...t, v: 2, status: 'pending', at: serverTimestamp() });

/** Records the money that changed hands, once the trade is done. Safe to call twice. */
export async function settleCash(tradeId: string) {
  const s = await getDoc(doc(db, 'trades', tradeId));
  const t = s.data() as Trade2 | undefined;
  if (!t || t.status !== 'done') return;
  const w: Promise<unknown>[] = [];
  if (hasCash(t.cash)) w.push(setDoc(doc(db, 'cashMoves', `${tradeId}_give`), { tradeId, from: t.from, to: t.to, dirty: t.cash.dirty, clean: t.cash.clean, at: serverTimestamp() }).catch(() => {}));
  if (hasCash(t.backCash))
    w.push(setDoc(doc(db, 'cashMoves', `${tradeId}_back`), { tradeId, from: t.to, to: t.from, dirty: t.backCash!.dirty, clean: t.backCash!.clean, at: serverTimestamp() }).catch(() => {}));
  await Promise.all(w);
}

export const answer = (id: string, patch: Partial<Trade2>) => updateDoc(doc(db, 'trades', id), { ...patch, ...(patch.status ? { closedAt: serverTimestamp() } : {}) });
