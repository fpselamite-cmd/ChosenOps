import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/https';
import { PIN_RE, pinToPassword, resetDenial, type MemberDoc, type RankDoc } from './policy.js';

initializeApp();
const db = getFirestore();

async function rankOf(member: MemberDoc | undefined) {
  if (!member?.rankId) return undefined;
  return (await db.doc(`ranks/${member.rankId}`).get()).data() as RankDoc | undefined;
}

/**
 * Officer sets a new PIN for a member ranked below them. The member's other
 * sessions are signed out so the old PIN stops working everywhere.
 */
export const resetPin = onCall<{ uid?: string; pin?: string }>(async (req) => {
  const callerId = req.auth?.uid;
  if (!callerId) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { uid: targetId, pin } = req.data ?? {};
  if (typeof targetId !== 'string' || !targetId) throw new HttpsError('invalid-argument', 'Missing member.');
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) throw new HttpsError('invalid-argument', 'PIN must be 4–8 digits.');

  const [callerSnap, targetSnap] = await Promise.all([db.doc(`users/${callerId}`).get(), db.doc(`users/${targetId}`).get()]);
  const caller = callerSnap.data() as MemberDoc | undefined;
  const target = targetSnap.data() as MemberDoc | undefined;
  const [callerRank, targetRank] = await Promise.all([rankOf(caller), rankOf(target)]);

  const denial = resetDenial(callerId, caller, callerRank, targetId, target, targetRank);
  if (denial) throw new HttpsError('permission-denied', denial);

  await getAuth().updateUser(targetId, { password: pinToPassword(pin) });
  await getAuth().revokeRefreshTokens(targetId);
  await targetSnap.ref.update({ pinResetBy: callerId, pinResetAt: FieldValue.serverTimestamp() });
  return { ok: true };
});
