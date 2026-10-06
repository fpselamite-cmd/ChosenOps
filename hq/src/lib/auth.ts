import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from './firebase';
import { DEFAULT_RANKS } from './types';

// People only ever see a name and PIN. Firebase Auth needs an email + password,
// so both are derived from them here.
const EMAIL_DOMAIN = 'hq.chosenops.app';
export const NAME_RE = /^[a-zA-Z0-9_. -]{3,20}$/;
export const PIN_RE = /^\d{4,8}$/;

/** Turns a display name into its unique key: lowercase, spaces become underscores. */
export const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '_');

/** Each PIN reset moves the member onto a fresh sign-in account, so the email carries a version. */
const toEmail = (key: string, v = 0) => `${key}${v ? `+${v}` : ''}@${EMAIL_DOMAIN}`;
const toPassword = (pin: string) => `chosenops:${pin}`;

export class AuthError extends Error {}

function friendly(err: unknown): Error {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'auth/email-already-in-use') return new AuthError('That name is already taken.');
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code))
    return new AuthError('Wrong name or PIN.');
  if (code === 'auth/too-many-requests') return new AuthError('Too many tries. Wait a minute and try again.');
  if (code === 'auth/network-request-failed') return new AuthError('Could not reach the server.');
  return err instanceof Error ? err : new Error(String(err));
}

export async function login(name: string, pin: string) {
  const key = nameKey(name);
  try {
    const v = (await getDoc(doc(db, 'names', key))).data()?.v ?? 0;
    await signInWithEmailAndPassword(auth, toEmail(key, v), toPassword(pin));
  } catch (err) {
    throw friendly(err);
  }
}

export const logout = () => signOut(auth);

/**
 * Creates the account. The very first person to register founds the gang: they become
 * the Boss and the default ranks and settings are seeded. Everyone after that waits for approval.
 */
export async function register(name: string, pin: string): Promise<{ founder: boolean }> {
  name = name.trim().replace(/\s+/g, ' ');
  if (!NAME_RE.test(name)) throw new AuthError('Name must be 3–20 letters, numbers, spaces, _ or .');
  if (!PIN_RE.test(pin)) throw new AuthError('PIN must be 4–8 digits.');
  const key = nameKey(name);
  if ((await getDoc(doc(db, 'names', key))).exists()) throw new AuthError('That name is already taken.');

  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, toEmail(key), toPassword(pin));
  } catch (err) {
    throw friendly(err);
  }
  const uid = cred.user.uid;
  const base = { name, nameLower: key, reportsTo: null, joinedAt: serverTimestamp(), avatar: null };

  try {
    if (!(await getDoc(doc(db, 'meta', 'hqFounding'))).exists()) {
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'meta', 'hqFounding'), { uid, at: serverTimestamp() });
        DEFAULT_RANKS.forEach((r, order) => {
          const { id, ...rest } = r;
          batch.set(doc(db, 'hqRanks', id), { ...rest, order });
        });
        batch.set(doc(db, 'members', uid), { ...base, status: 'active', rankId: DEFAULT_RANKS[0].id });
        batch.set(doc(db, 'names', key), { uid, v: 0 });
        batch.set(doc(db, 'settings', 'gang'), { name: 'The Chosen', motto: 'Chosen by blood. Bound in gold.' });
        batch.set(doc(db, 'settings', 'announcement'), {
          text: 'Welcome to ChosenOps HQ. Everything the family runs, in one place.',
          by: uid,
          at: serverTimestamp(),
        });
        await batch.commit();
        return { founder: true };
      } catch {
        // Someone else founded the gang at the same moment: fall through to a normal signup.
      }
    }
    const batch = writeBatch(db);
    batch.set(doc(db, 'members', uid), { ...base, status: 'pending', rankId: null });
    batch.set(doc(db, 'names', key), { uid, v: 0 });
    await batch.commit();
    return { founder: false };
  } catch (err) {
    await deleteUser(cred.user).catch(() => {});
    throw friendly(err);
  }
}

/** Changes your own PIN. Needs the current one. */
export async function changePin(currentPin: string, newPin: string) {
  if (!PIN_RE.test(newPin)) throw new AuthError('PIN must be 4–8 digits.');
  const user = auth.currentUser;
  if (!user?.email) throw new AuthError('Not signed in.');
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, toPassword(currentPin)));
  } catch (err) {
    const e = friendly(err);
    throw e instanceof AuthError ? new AuthError('Your current PIN is wrong.') : e;
  }
  await updatePassword(user, toPassword(newPin));
}

// Reset codes avoid look-alike characters (0/O, 1/I/L) so they're easy to read out.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RESET_HOURS = 24;

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Officer-only: a one-time code the member uses to pick a new PIN. Replaces any earlier code. */
export async function issueResetCode(memberId: string, officerId: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  const expiresAt = Timestamp.fromMillis(Date.now() + RESET_HOURS * 3600_000);
  await setDoc(doc(db, 'pinResets', memberId), {
    codeHash: await sha256Hex(code),
    by: officerId,
    expiresAt,
    at: serverTimestamp(),
  });
  return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt: expiresAt.toDate() };
}

/**
 * Redeems a reset code: makes a fresh sign-in account with the new PIN and links it to
 * the member file. The security rules check the code and retire the old account.
 */
export async function redeemResetCode(name: string, rawCode: string, pin: string) {
  const key = nameKey(name);
  const code = normalizeCode(rawCode);
  if (!PIN_RE.test(pin)) throw new AuthError('PIN must be 4–8 digits.');
  if (code.length !== 8) throw new AuthError('Reset codes are 8 characters, like ABCD-2345.');
  const nameSnap = await getDoc(doc(db, 'names', key));
  if (!nameSnap.exists()) throw new AuthError('Nobody has that name.');
  const { uid: memberId, v = 0 } = nameSnap.data() as { uid: string; v?: number };

  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, toEmail(key, v + 1), toPassword(pin));
  } catch (err) {
    // An earlier attempt left an account at this version; sign into it if the PIN matches.
    if ((err as { code?: string }).code !== 'auth/email-already-in-use') throw friendly(err);
    try {
      cred = await signInWithEmailAndPassword(auth, toEmail(key, v + 1), toPassword(pin));
    } catch {
      throw new AuthError('That reset was already started with a different PIN. Ask for a new code.');
    }
  }
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'authLinks', cred.user.uid), { memberId, code });
    batch.update(doc(db, 'members', memberId), { authUid: cred.user.uid });
    batch.update(doc(db, 'names', key), { v: v + 1 });
    batch.delete(doc(db, 'pinResets', memberId));
    await batch.commit();
  } catch {
    await deleteUser(cred.user).catch(() => signOut(auth));
    throw new AuthError('That code is wrong, expired or already used.');
  }
}
