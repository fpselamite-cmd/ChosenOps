import { collection, doc, increment, serverTimestamp, setDoc, writeBatch, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { PettyCrime, RepTransfer } from './types';

/** Quick +/- on your own petty rep. */
export const adjustRep = (memberId: string, delta: number) =>
  setDoc(doc(db, 'petty', memberId), { rep: increment(delta) }, { merge: true });

/** Logs a session of jobs: adds its rep to your total and its dirty money to your locker. */
export async function logSession(memberId: string, c: { crimes: Record<string, number>; perJob: number[]; rep: number; cash: number; notes: string }) {
  const batch = writeBatch(db);
  const crimes = Object.fromEntries(Object.entries(c.crimes).filter(([, n]) => n > 0));
  const crime = Object.entries(crimes)
    .map(([k, n]) => `${k} ×${n}`)
    .join(' · ')
    .slice(0, 80) || 'Jobs';
  const cashRef = c.cash > 0 ? doc(collection(db, 'myCash')) : null;
  if (cashRef) batch.set(cashRef, { memberId, dirty: c.cash, clean: 0, note: `Petty crime: ${crime}`.slice(0, 60), at: serverTimestamp() });
  const ref = doc(collection(db, 'pettyLog'));
  batch.set(ref, { memberId, crime, crimes, perJob: c.perJob.slice(0, 50), rep: c.rep, cash: c.cash, cashId: cashRef?.id ?? null, notes: c.notes.slice(0, 140), at: serverTimestamp() });
  if (c.rep) batch.set(doc(db, 'petty', memberId), { rep: increment(c.rep) }, { merge: true });
  await batch.commit();
  return ref.id;
}

/** How many jobs a session holds (old single entries count as one). */
export const jobsIn = (c: PettyCrime) => (c.crimes ? Object.values(c.crimes).reduce((s, n) => s + n, 0) : 1);
/** Crime type → count for a session; old entries count their one crime. */
export const crimesIn = (c: PettyCrime): Record<string, number> => c.crimes ?? { [c.crime]: 1 };

/** Monday 00:00 of this week, local time. */
export function weekStart(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Days in a row with at least one session, ending today or yesterday. */
export function hotStreak(sessions: PettyCrime[]) {
  const days = new Set(sessions.map((c) => c.at && new Date(c.at.toMillis()).toDateString()).filter(Boolean));
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(d.toDateString())) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** A member's own weekly rep goal. */
export const setWeeklyGoal = (memberId: string, weekly: number) => setDoc(doc(db, 'pettyGoals', memberId), { weekly: Math.max(0, Math.round(weekly)) });

/** The family goal leadership sets: confirmed rep from `from` until the end of `by`. */
export interface FamilyGoal {
  title: string;
  target: number;
  /** YYYY-MM-DD */
  by: string;
  from?: Timestamp;
}
export const setFamilyGoal = (g: Omit<FamilyGoal, 'from'> | null) =>
  setDoc(doc(db, 'settings', 'pettyGoal'), g ? { ...g, from: serverTimestamp() } : { title: '', target: 0, by: '', from: serverTimestamp() });

/** Sends rep to the family. It leaves your total now and waits for a Lieutenant+ to confirm. */
export async function requestTransfer(memberId: string, amount: number) {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'repTransfers')), { memberId, amount, status: 'pending', at: serverTimestamp() });
  batch.set(doc(db, 'petty', memberId), { rep: increment(-amount) }, { merge: true });
  await batch.commit();
}

/** Confirming adds it to the family total. */
export async function confirmTransfer(t: RepTransfer, by: string) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'repTransfers', t.id), { status: 'confirmed', decidedBy: by, decidedAt: serverTimestamp() });
  batch.set(doc(db, 'stats', 'familyRep'), { total: increment(t.amount), lastTransfer: t.id }, { merge: true });
  await batch.commit();
}

/** Rejecting gives the rep back to the member. */
export async function rejectTransfer(t: RepTransfer, by: string) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'repTransfers', t.id), { status: 'rejected', decidedBy: by, decidedAt: serverTimestamp() });
  batch.set(doc(db, 'petty', t.memberId), { rep: increment(t.amount), refundOf: t.id }, { merge: true });
  await batch.commit();
}

/** Removes a logged session: takes its rep back off (never below zero) and its money out of the locker. */
export async function deleteCrime(c: PettyCrime, currentRep: number) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'pettyLog', c.id));
  if (c.cashId) batch.delete(doc(db, 'myCash', c.cashId));
  const back = Math.min(c.rep, currentRep);
  if (back > 0) batch.set(doc(db, 'petty', c.memberId), { rep: increment(-back) }, { merge: true });
  await batch.commit();
}
