import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { ChronicleEvent, JournalEntry, LoreEntry, RelationshipType } from './types';

export type LoreDraft = Pick<LoreEntry, 'title' | 'category' | 'summary' | 'body' | 'characters'>;

/**
 * Creates or updates an Archive entry. `cover` is the full-size image (stored in
 * loreCovers/{id}) and `thumb` the small card image kept on the entry itself;
 * pass null to remove the cover, undefined to leave it unchanged.
 */
export async function saveLore(
  existing: LoreEntry | null,
  draft: LoreDraft,
  me: string,
  images?: { cover: string; thumb: string } | null,
) {
  const ref = existing ? doc(db, 'lore', existing.id) : doc(collection(db, 'lore'));
  const batch = writeBatch(db);
  const base = {
    ...draft,
    title: draft.title.trim(),
    summary: draft.summary?.trim() ?? '',
    updatedAt: serverTimestamp(),
    updatedBy: me,
    ...(images !== undefined ? { thumb: images?.thumb ?? null } : {}),
  };
  if (existing) batch.update(ref, base);
  else batch.set(ref, { thumb: null, ...base, canon: false, authorId: me, createdAt: serverTimestamp() });
  if (images) batch.set(doc(db, 'loreCovers', ref.id), { image: images.cover });
  else if (images === null && existing) batch.delete(doc(db, 'loreCovers', ref.id));
  await batch.commit();
  return ref.id;
}

export async function deleteLore(id: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'lore', id));
  batch.delete(doc(db, 'loreCovers', id));
  await batch.commit();
}

export const setCanon = (id: string, canon: boolean, me: string) =>
  updateDoc(doc(db, 'lore', id), { canon, updatedAt: serverTimestamp(), updatedBy: me });

export type EventDraft = Pick<ChronicleEvent, 'title' | 'when' | 'whenLabel' | 'description' | 'loreId' | 'characters'>;

export async function saveEvent(existing: ChronicleEvent | null, draft: EventDraft, me: string) {
  const data = { ...draft, title: draft.title.trim(), whenLabel: draft.whenLabel?.trim() ?? '', description: draft.description?.trim() ?? '' };
  if (existing) await updateDoc(doc(db, 'chronicle', existing.id), data);
  else await addDoc(collection(db, 'chronicle'), { ...data, authorId: me, createdAt: serverTimestamp() });
}
export const deleteEvent = (id: string) => deleteDoc(doc(db, 'chronicle', id));

export type JournalDraft = Pick<JournalEntry, 'title' | 'body' | 'whenLabel'>;

export async function saveJournal(existing: JournalEntry | null, draft: JournalDraft, me: string) {
  const data = { title: draft.title.trim(), body: draft.body, whenLabel: draft.whenLabel?.trim() ?? '' };
  if (existing) await updateDoc(doc(db, 'journals', existing.id), { ...data, updatedAt: serverTimestamp() });
  else await addDoc(collection(db, 'journals'), { ...data, authorId: me, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export const deleteJournal = (id: string) => deleteDoc(doc(db, 'journals', id));

export const addTie = (a: string, b: string, type: RelationshipType, note: string, me: string) =>
  addDoc(collection(db, 'relationships'), { a, b, type, note: note.trim(), createdBy: me, createdAt: serverTimestamp() });
export const removeTie = (id: string) => deleteDoc(doc(db, 'relationships', id));

/** Normalizes a free-form in-world year/date into the sortable YYYY-MM-DD the Chronicle uses. */
export function toWhen(year: string, month = '01', day = '01') {
  const y = year.trim();
  const neg = y.startsWith('-');
  const digits = y.replace(/\D/g, '').slice(0, 6) || '0';
  return `${neg ? '-' : ''}${digits.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** Chronological order for in-world dates, including negative ("before the founding") years. */
export function compareWhen(a: string, b: string) {
  const parse = (w: string) => {
    const m = /^(-?\d+)-(\d{2})-(\d{2})$/.exec(w);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  };
  const [x, y] = [parse(a), parse(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}
