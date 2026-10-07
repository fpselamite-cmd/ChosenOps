import { addDoc, collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Member, MemberStatus } from './types';

export type ProfilePatch = Partial<Pick<Member, 'avatar' | 'alias' | 'phone' | 'bio' | 'birthday'>>;

/** Your own profile fields. Rank, status and chain of command are officer-only. */
export const updateProfile = (id: string, patch: ProfilePatch) => updateDoc(doc(db, 'members', id), patch);

/** Family news for the Dashboard briefing. */
export const news = (kind: 'joined' | 'promoted', memberId: string, rankId: string) => addDoc(collection(db, 'news'), { kind, memberId, rankId, at: serverTimestamp() }).catch(() => {});

export const approveMember = (id: string, rankId: string) => updateDoc(doc(db, 'members', id), { status: 'active', rankId }).then(() => news('joined', id, rankId));
export const setRank = (id: string, rankId: string, promoted = false) => updateDoc(doc(db, 'members', id), { rankId }).then(() => { if (promoted) void news('promoted', id, rankId); });
export const setStatus = (id: string, status: MemberStatus) => updateDoc(doc(db, 'members', id), { status });
export const setReportsTo = (id: string, reportsTo: string | null) => updateDoc(doc(db, 'members', id), { reportsTo });

export const setPresenceStatus = (id: string, status: string) =>
  setDoc(doc(db, 'presence', id), { status, at: serverTimestamp() }, { merge: true });
