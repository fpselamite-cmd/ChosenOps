import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from './firebase';
import { DEFAULT_INVENTORY_CATEGORIES, DEFAULT_RANKS, DEFAULT_TRANSACTION_CATEGORIES } from './types';

// Members only ever see a username and PIN. Under the hood Firebase Auth needs an
// email + password, so both are derived deterministically here.
const EMAIL_DOMAIN = 'members.chosen.hub';
export const USERNAME_RE = /^[a-zA-Z0-9_.]{3,20}$/;
export const PIN_RE = /^\d{4,8}$/;

const toEmail = (username: string) => `${username.toLowerCase()}@${EMAIL_DOMAIN}`;
const toPassword = (pin: string) => `chosen:${pin}`;

export class AuthError extends Error {}

function friendly(err: unknown): Error {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'auth/email-already-in-use') return new AuthError('That name is already taken.');
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code))
    return new AuthError('Wrong username or PIN.');
  if (code === 'auth/too-many-requests') return new AuthError('Too many attempts. Wait a minute and try again.');
  if (code === 'auth/network-request-failed') return new AuthError('Could not reach the server.');
  return err instanceof Error ? err : new Error(String(err));
}

export async function login(username: string, pin: string) {
  try {
    await signInWithEmailAndPassword(auth, toEmail(username.trim()), toPassword(pin));
  } catch (err) {
    throw friendly(err);
  }
}

export const logout = () => signOut(auth);

/** Officer-only: sets a new PIN for a member ranked below the caller (see functions/src/index.ts). */
export async function resetMemberPin(uid: string, pin: string) {
  if (!PIN_RE.test(pin)) throw new AuthError('PIN must be 4–8 digits.');
  try {
    await httpsCallable(functions, 'resetPin')({ uid, pin });
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (code === 'functions/not-found' || code === 'functions/internal')
      throw new AuthError('PIN reset is not set up on the server yet (deploy the resetPin function).');
    throw new AuthError((err as Error).message);
  }
}

/**
 * Creates the account. The very first member to register founds the family:
 * they become active at the top rank and the default ranks/settings are seeded.
 * Everyone after that starts as `pending` until an officer approves them.
 */
export async function register(username: string, pin: string): Promise<{ founder: boolean }> {
  username = username.trim();
  if (!USERNAME_RE.test(username)) throw new AuthError('Username must be 3–20 letters, numbers, _ or .');
  if (!PIN_RE.test(pin)) throw new AuthError('PIN must be 4–8 digits.');

  const lower = username.toLowerCase();
  if ((await getDoc(doc(db, 'usernames', lower))).exists()) throw new AuthError('That name is already taken.');

  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, toEmail(username), toPassword(pin));
  } catch (err) {
    throw friendly(err);
  }
  const uid = cred.user.uid;
  const base = { username, usernameLower: lower, reportsTo: null, joinedAt: serverTimestamp(), character: {}, avatar: null };

  try {
    const founded = (await getDoc(doc(db, 'meta', 'bootstrap'))).exists();
    if (!founded) {
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'meta', 'bootstrap'), { uid, at: serverTimestamp() });
        DEFAULT_RANKS.forEach((r, order) => {
          const { id, ...rest } = r;
          batch.set(doc(db, 'ranks', id), { ...rest, order });
        });
        batch.set(doc(db, 'users', uid), { ...base, status: 'active', rankId: DEFAULT_RANKS[0].id });
        batch.set(doc(db, 'usernames', lower), { uid });
        batch.set(doc(db, 'settings', 'branding'), { name: 'The Chosen', motto: 'Blood. Gold. Loyalty.', logo: null });
        batch.set(doc(db, 'settings', 'family'), {
          announcement: 'Welcome to the hub. The family is open for business.',
          inventoryCategories: DEFAULT_INVENTORY_CATEGORIES,
          transactionCategories: DEFAULT_TRANSACTION_CATEGORIES,
        });
        await batch.commit();
        return { founder: true };
      } catch {
        // Someone else founded the family at the same moment — fall through to a normal signup.
      }
    }
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid), { ...base, status: 'pending', rankId: null });
    batch.set(doc(db, 'usernames', lower), { uid });
    await batch.commit();
    return { founder: false };
  } catch (err) {
    await deleteUser(cred.user).catch(() => {});
    throw friendly(err);
  }
}
