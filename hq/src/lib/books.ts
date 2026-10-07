import { addDoc, collection, deleteDoc, doc, increment, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

/**
 * The gang's books, beyond Narco sales: money in and out in dirty or clean, payouts owed to
 * members, monthly budgets, savings goals, spend requests, and the weekly dinner dues.
 */
export type Cash = 'dirty' | 'clean';
export const CASH: Cash[] = ['dirty', 'clean'];

// ---------- book entries ----------

export interface BookEntry {
  id: string;
  dir: 'in' | 'out';
  cash: Cash;
  amount: number;
  category: string;
  note?: string;
  /** A member it was paid to or came from. */
  memberId?: string | null;
  /** What made it: dues, payout, spend, goal, manual. */
  source: 'manual' | 'dues' | 'payout' | 'spend' | 'goal';
  ref?: string | null;
  by: string;
  byName: string;
  at?: Timestamp;
}
export const CATEGORIES = ['Weapons', 'Vehicles', 'Property', 'Bail & lawyers', 'Supplies', 'Payouts', 'Events', 'Other'];

const me_ = (me: { id: string; name: string }) => ({ by: me.id, byName: me.name, at: serverTimestamp() });
export const addEntry = (me: { id: string; name: string }, e: Pick<BookEntry, 'dir' | 'cash' | 'amount' | 'category' | 'note' | 'memberId' | 'source' | 'ref'>) =>
  addDoc(collection(db, 'gangBook'), { note: '', memberId: null, ref: null, ...e, amount: Math.round(e.amount), ...me_(me) });
export const removeEntry = (id: string) => deleteDoc(doc(db, 'gangBook', id));

// ---------- payouts: Treasurer pays, the member confirms they got it ----------

export interface Payout {
  id: string;
  memberId: string;
  memberName: string;
  cash: Cash;
  amount: number;
  reason: string;
  /** owed → sent (Treasurer paid it) → received (member got it, it lands in their safe). */
  status: 'owed' | 'sent' | 'received';
  by: string;
  at?: Timestamp;
  sentAt?: Timestamp;
}
export const owePayout = (me: { id: string; name: string }, p: Pick<Payout, 'memberId' | 'memberName' | 'cash' | 'amount' | 'reason'>) =>
  addDoc(collection(db, 'payouts'), { ...p, amount: Math.round(p.amount), status: 'owed', by: me.id, at: serverTimestamp() });
/** Paying takes it out of the gang bank now. */
export function sendPayout(me: { id: string; name: string }, p: Payout) {
  const b = writeBatch(db);
  b.update(doc(db, 'payouts', p.id), { status: 'sent', sentAt: serverTimestamp() });
  b.set(doc(collection(db, 'gangBook')), { dir: 'out', cash: p.cash, amount: p.amount, category: 'Payouts', note: p.reason, memberId: p.memberId, source: 'payout', ref: p.id, ...me_(me) });
  return b.commit();
}
/** The member confirms: it lands in their locker safe. */
export function receivePayout(p: Payout) {
  const b = writeBatch(db);
  b.update(doc(db, 'payouts', p.id), { status: 'received' });
  b.set(doc(collection(db, 'myCash')), { memberId: p.memberId, dirty: p.cash === 'dirty' ? p.amount : 0, clean: p.cash === 'clean' ? p.amount : 0, note: `Payout: ${p.reason}`.slice(0, 60), at: serverTimestamp() });
  return b.commit();
}
export const dropPayout = (id: string) => deleteDoc(doc(db, 'payouts', id));

// ---------- budgets ----------

/** Planned spend for a month, by category, in dirty and clean. */
export interface Budget {
  id: string;
  cats: Record<string, { dirty: number; clean: number }>;
}
export const monthOf = (t: Date | number = Date.now()) => new Date(t).toISOString().slice(0, 7);
export const saveBudget = (month: string, cats: Budget['cats']) => setDoc(doc(db, 'budgets', month), { cats });

// ---------- savings goals ----------

export interface Goal {
  id: string;
  name: string;
  cash: Cash;
  target: number;
  saved: number;
  done?: boolean;
  at?: Timestamp;
}
export const addGoal = (g: Pick<Goal, 'name' | 'cash' | 'target'>) => addDoc(collection(db, 'savingsGoals'), { ...g, saved: 0, done: false, at: serverTimestamp() });
/** Putting money toward a goal sets it aside out of the bank. */
export function fundGoal(me: { id: string; name: string }, g: Goal, amount: number) {
  const b = writeBatch(db);
  b.update(doc(db, 'savingsGoals', g.id), { saved: increment(amount), done: g.saved + amount >= g.target });
  b.set(doc(collection(db, 'gangBook')), { dir: 'out', cash: g.cash, amount, category: 'Savings', note: g.name, memberId: null, source: 'goal', ref: g.id, ...me_(me) });
  return b.commit();
}
export const removeGoal = (id: string) => deleteDoc(doc(db, 'savingsGoals', id));

// ---------- spend requests ----------

export interface SpendRequest {
  id: string;
  by: string;
  byName: string;
  cash: Cash;
  amount: number;
  category: string;
  why: string;
  status: 'open' | 'approved' | 'denied';
  decidedBy?: string;
  at?: Timestamp;
}
export const askToSpend = (me: { id: string; name: string }, r: Pick<SpendRequest, 'cash' | 'amount' | 'category' | 'why'>) =>
  addDoc(collection(db, 'spendRequests'), { ...r, amount: Math.round(r.amount), status: 'open', by: me.id, byName: me.name, at: serverTimestamp() });
/** Approving pays it out of the bank to the member who asked (it lands in their safe once they confirm). */
export function decideSpend(me: { id: string; name: string }, r: SpendRequest, ok: boolean) {
  const b = writeBatch(db);
  b.update(doc(db, 'spendRequests', r.id), { status: ok ? 'approved' : 'denied', decidedBy: me.id });
  if (ok) b.set(doc(collection(db, 'payouts')), { memberId: r.by, memberName: r.byName, cash: r.cash, amount: r.amount, reason: `${r.category}: ${r.why}`.slice(0, 80), status: 'owed', by: me.id, at: serverTimestamp() });
  return b.commit();
}

// ---------- dinner dues ----------

export interface DuesAmounts {
  rep: number;
  clean: number;
  dirty: number;
}
/** Set by High Table: the dinner day and what each rank owes. */
export interface DuesSettings {
  /** 0 = Sunday. */
  day: number;
  byRank: Record<string, DuesAmounts>;
}
/** One dinner: who was expected and what they owed then, and who was excused. */
export interface DuesWeek {
  id: string;
  owe: Record<string, DuesAmounts>;
  excused?: Record<string, boolean>;
  at?: Timestamp;
}
/** A clean or dirty dues payment. It leaves the member's safe when marked; the Treasurer confirms it into the bank. */
export interface DuesPay {
  id: string;
  memberId: string;
  week: string;
  cash: Cash;
  amount: number;
  status: 'pending' | 'confirmed' | 'rejected';
  cashId: string;
  decidedBy?: string;
  at?: Timestamp;
}
export const saveDuesSettings = (s: DuesSettings) => setDoc(doc(db, 'settings', 'dues'), s);
export const openDinner = (week: string, owe: DuesWeek['owe']) => setDoc(doc(db, 'duesWeeks', week), { owe, excused: {}, at: serverTimestamp() });
export const excuse = (week: string, memberId: string, on: boolean) => updateDoc(doc(db, 'duesWeeks', week), { [`excused.${memberId}`]: on });

export function payDues(memberId: string, week: string, cash: Cash, amount: number) {
  const b = writeBatch(db);
  const cashRef = doc(collection(db, 'myCash'));
  b.set(cashRef, { memberId, dirty: cash === 'dirty' ? -amount : 0, clean: cash === 'clean' ? -amount : 0, note: `Dinner dues ${week}`, at: serverTimestamp() });
  b.set(doc(collection(db, 'duesPay')), { memberId, week, cash, amount, status: 'pending', cashId: cashRef.id, at: serverTimestamp() });
  return b.commit();
}
export const confirmDues = (p: DuesPay, by: string) => updateDoc(doc(db, 'duesPay', p.id), { status: 'confirmed', decidedBy: by });
/** Rejecting puts the cash back in their safe. */
export function rejectDues(p: DuesPay, by: string) {
  const b = writeBatch(db);
  b.update(doc(db, 'duesPay', p.id), { status: 'rejected', decidedBy: by });
  b.delete(doc(db, 'myCash', p.cashId));
  return b.commit();
}

/** The dinner date (YYYY-MM-DD, city time) on or before `now` for a weekly dinner `day`. */
export function dinnerOf(day: number, parts: { y: number; m: number; d: number; wd: number }) {
  const back = (parts.wd - day + 7) % 7;
  const t = new Date(Date.UTC(parts.y, parts.m - 1, parts.d - back));
  return t.toISOString().slice(0, 10);
}
