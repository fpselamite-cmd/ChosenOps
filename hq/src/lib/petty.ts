import { collection, doc, increment, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { PettyCrime, RepTransfer } from './types';

/** Quick +/- on your own petty rep. */
export const adjustRep = (memberId: string, delta: number) =>
  setDoc(doc(db, 'petty', memberId), { rep: increment(delta) }, { merge: true });

/** Logs a crime and adds its rep to your total. */
export async function logCrime(memberId: string, c: { crime: string; rep: number; cash: number; notes: string }) {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'pettyLog')), { memberId, ...c, at: serverTimestamp() });
  if (c.rep) batch.set(doc(db, 'petty', memberId), { rep: increment(c.rep) }, { merge: true });
  await batch.commit();
}

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

/** Removes a logged crime and takes its rep back off (never below zero). */
export async function deleteCrime(c: PettyCrime, currentRep: number) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'pettyLog', c.id));
  const back = Math.min(c.rep, currentRep);
  if (back > 0) batch.set(doc(db, 'petty', c.memberId), { rep: increment(-back) }, { merge: true });
  await batch.commit();
}
