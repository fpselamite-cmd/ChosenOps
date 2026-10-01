import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from './firebase';
import { DEFAULT_LORE_CATEGORIES, DEFAULT_RANKS } from './types';

// Members only ever see a username and PIN. Under the hood Firebase Auth needs an
// email + password, so both are derived deterministically here.
const EMAIL_DOMAIN = 'members.chosen.hub';
export const USERNAME_RE = /^[a-zA-Z0-9_.]{3,20}$/;
export const PIN_RE = /^\d{4,8}$/;

/**
 * Each PIN reset moves the member onto a fresh sign-in account (see firestore.rules),
 * so the email carries a version: `name@…` originally, then `name+1@…`, `name+2@…`.
 */
const toEmail = (username: string, v = 0) => `${username.toLowerCase()}${v ? `+${v}` : ''}@${EMAIL_DOMAIN}`;
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
  const lower = username.trim().toLowerCase();
  try {
    const v = (await getDoc(doc(db, 'usernames', lower))).data()?.v ?? 0;
    await signInWithEmailAndPassword(auth, toEmail(lower, v), toPassword(pin));
  } catch (err) {
    throw friendly(err);
  }
}

export const logout = () => signOut(auth);

// Reset codes avoid look-alike characters (0/O, 1/I/L) so they're easy to read out.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RESET_HOURS = 24;

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Officer-only: issues a one-time code the member can use to choose a new PIN. Replaces any earlier code. */
export async function issueResetCode(memberId: string, officerId: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  const expiresAt = Timestamp.fromMillis(Date.now() + RESET_HOURS * 3600_000);
  await setDoc(doc(db, 'pinResets', memberId), { codeHash: await sha256Hex(code), by: officerId, expiresAt, at: serverTimestamp() });
  return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt: expiresAt.toDate() };
}

/**
 * Member redeems a reset code: creates a fresh sign-in account with the new PIN and
 * links it to their member file. The rules verify the code and retire the old account.
 */
export async function redeemResetCode(username: string, rawCode: string, pin: string) {
  const lower = username.trim().toLowerCase();
  const code = normalizeCode(rawCode);
  if (!PIN_RE.test(pin)) throw new AuthError('PIN must be 4–8 digits.');
  if (code.length !== 8) throw new AuthError('Reset codes are 8 characters, like ABCD-2345.');
  const nameSnap = await getDoc(doc(db, 'usernames', lower));
  if (!nameSnap.exists()) throw new AuthError('No member with that username.');
  const { uid: memberId, v = 0 } = nameSnap.data() as { uid: string; v?: number };

  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, toEmail(lower, v + 1), toPassword(pin));
  } catch (err) {
    // A previous attempt left an account behind at this version; sign into it if the PIN matches.
    if ((err as { code?: string }).code !== 'auth/email-already-in-use') throw friendly(err);
    try {
      cred = await signInWithEmailAndPassword(auth, toEmail(lower, v + 1), toPassword(pin));
    } catch {
      throw new AuthError('That reset was already started with a different PIN. Ask for a new code.');
    }
  }
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'authLinks', cred.user.uid), { memberId, code });
    batch.update(doc(db, 'users', memberId), { authUid: cred.user.uid });
    batch.update(doc(db, 'usernames', lower), { v: v + 1 });
    batch.delete(doc(db, 'pinResets', memberId));
    await batch.commit();
  } catch {
    await deleteUser(cred.user).catch(() => signOut(auth));
    throw new AuthError('That code is wrong, expired or already used.');
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
          announcement: 'Welcome to the Archive. Every story we write down becomes part of who we are.',
          loreCategories: DEFAULT_LORE_CATEGORIES,
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
