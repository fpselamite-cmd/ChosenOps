import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Admin access. An owner (set from GitHub) picks the admin password; any member who enters it
 * gets every power except acting on the top rank. Owners can also grant or take it away directly.
 * Only a SHA-256 of the password is stored, and nobody can read even that.
 */
const SALT = 'chosenops-admin:';

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Turns admin on for me if the password is right. Returns false if it isn't. */
export async function claimAdmin(me: string, password: string) {
  const b = writeBatch(db);
  b.set(doc(db, 'adminClaims', me), { code: password, at: serverTimestamp() });
  b.update(doc(db, 'members', me), { admin: true });
  try {
    await b.commit();
    return true;
  } catch {
    return false;
  } finally {
    // Don't leave what was typed lying around.
    deleteDoc(doc(db, 'adminClaims', me)).catch(() => {});
  }
}

export const stepDown = (me: string) => updateDoc(doc(db, 'members', me), { admin: false });
export const setAdmin = (memberId: string, on: boolean) => updateDoc(doc(db, 'members', memberId), { admin: on });
export const setAdminPassword = async (me: string, password: string) =>
  setDoc(doc(db, 'settings', 'adminKey'), { hash: await sha256(SALT + password), by: me, at: serverTimestamp() });
