import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Crew } from './types';

export type CrewDraft = Pick<Crew, 'name' | 'tag' | 'color' | 'motto' | 'leaderId'>;

export async function createCrew(d: CrewDraft) {
  const ref = await addDoc(collection(db, 'crews'), {
    ...d,
    emblem: null,
    memberIds: d.leaderId ? [d.leaderId] : [],
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export const updateCrew = (id: string, patch: Partial<Omit<Crew, 'id'>>) => updateDoc(doc(db, 'crews', id), patch);

/** The new leader is always added to the crew too. */
export const setCrewLeader = (id: string, leaderId: string | null) =>
  updateDoc(doc(db, 'crews', id), leaderId ? { leaderId, memberIds: arrayUnion(leaderId) } : { leaderId: null });

export const addToCrew = (id: string, memberId: string) => updateDoc(doc(db, 'crews', id), { memberIds: arrayUnion(memberId) });
export const removeFromCrew = (id: string, memberId: string) =>
  updateDoc(doc(db, 'crews', id), { memberIds: arrayRemove(memberId) });

export const deleteCrew = (id: string) => deleteDoc(doc(db, 'crews', id));

/** "Grow Crew" → "GRO". */
export const suggestTag = (name: string) =>
  name
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(/\s+/)
    .filter((w) => w && !/^crew$/i.test(w))
    .map((w, _, all) => (all.length > 1 ? w[0] : w.slice(0, 3)))
    .join('')
    .slice(0, 4)
    .toUpperCase();
