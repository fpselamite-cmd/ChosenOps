import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * The Archives: the Archivist's dinner notes after each family dinner, and the gang's lore book
 * (chapters, stories members send in, character pages and the wars), with a timeline of key dates.
 */

type Me = { id: string; name: string };

export interface DinnerNote {
  id: string;
  /** The dinner date, YYYY-MM-DD (same as its dues week). */
  date: string;
  title: string;
  present: string[];
  excused: string[];
  absent: string[];
  topics: string;
  decisions: string;
  announcements: string;
  quote: string;
  quoteBy: string;
  /** Free-written minutes, on top of the template. */
  minutes: string;
  /** Promotions and blood-ins that week. */
  ranks: { memberId: string; name: string; rankName: string; kind: 'joined' | 'promoted' }[];
  status: 'draft' | 'published';
  by: string;
  byName: string;
  at?: Timestamp;
  publishedAt?: Timestamp | null;
}
export const blankNote = (date: string): Omit<DinnerNote, 'id' | 'by' | 'byName' | 'at'> => ({
  date,
  title: 'Family Dinner',
  present: [],
  excused: [],
  absent: [],
  topics: '',
  decisions: '',
  announcements: '',
  quote: '',
  quoteBy: '',
  minutes: '',
  ranks: [],
  status: 'draft',
  publishedAt: null,
});
export function saveNote(me: Me, n: Omit<DinnerNote, 'id' | 'by' | 'byName' | 'at'>, publish: boolean) {
  return setDoc(doc(db, 'dinnerNotes', n.date), {
    ...n,
    status: publish ? 'published' : 'draft',
    publishedAt: publish ? (n.publishedAt ?? serverTimestamp()) : null,
    by: me.id,
    byName: me.name,
    at: serverTimestamp(),
  });
}
export const removeNote = (id: string) => deleteDoc(doc(db, 'dinnerNotes', id));

export type LoreKind = 'chapter' | 'story' | 'character' | 'war';
export const LORE_KINDS: { id: LoreKind; label: string }[] = [
  { id: 'chapter', label: 'Chapter of the lore book' },
  { id: 'story', label: 'Story from the family' },
  { id: 'character', label: 'Character page' },
  { id: 'war', label: 'War & rivalry' },
];
export interface Lore {
  id: string;
  kind: LoreKind;
  title: string;
  /** An era or subtitle, e.g. "The early days · 2025". */
  era: string;
  body: string;
  /** Chapter number (chapters sort by it). */
  order: number;
  /** For a character page. */
  memberId?: string | null;
  /** For a war page: the rival case file. */
  gangId?: string | null;
  /** "As told by …" on stories sent in. */
  credit?: string;
  images: string[];
  /** Spine color on the shelf. */
  color: string;
  status: 'draft' | 'submitted' | 'published' | 'rejected';
  reviewNote?: string;
  by: string;
  byName: string;
  at?: Timestamp;
  publishedAt?: Timestamp | null;
}
export const SPINES = ['#4a0f0c', '#0f1a2a', '#2a0f2a', '#1a2a14', '#3a2a0c', '#1a1a1a', '#2a1a0c', '#14202a'];
export const blankLore = (kind: LoreKind): Omit<Lore, 'id' | 'by' | 'byName' | 'at'> => ({
  kind,
  title: '',
  era: '',
  body: '',
  order: 0,
  memberId: null,
  gangId: null,
  credit: '',
  images: [],
  color: SPINES[Math.floor(Math.random() * SPINES.length)]!,
  status: 'draft',
  publishedAt: null,
});
const clip = (l: Omit<Lore, 'id' | 'by' | 'byName' | 'at'>) => ({ ...l, title: l.title.slice(0, 80), era: l.era.slice(0, 80), body: l.body.slice(0, 40000), images: l.images.slice(0, 4) });
/** The Archivist writes and edits. */
export function saveLore(me: Me, id: string | null, l: Omit<Lore, 'id' | 'by' | 'byName' | 'at'>, publish: boolean) {
  const data = { ...clip(l), status: publish ? 'published' : 'draft', publishedAt: publish ? (l.publishedAt ?? serverTimestamp()) : null };
  return id ? updateDoc(doc(db, 'lore', id), data) : addDoc(collection(db, 'lore'), { ...data, by: me.id, byName: me.name, at: serverTimestamp() });
}
/** A member sends in a story for the Archivist to approve. */
export const submitStory = (me: Me, s: { title: string; body: string; images: string[] }) =>
  addDoc(collection(db, 'lore'), { ...clip({ ...blankLore('story'), ...s, credit: me.name }), status: 'submitted', by: me.id, byName: me.name, at: serverTimestamp() });
export const reviewStory = (id: string, ok: boolean, note = '') =>
  updateDoc(doc(db, 'lore', id), ok ? { status: 'published', publishedAt: serverTimestamp(), reviewNote: '' } : { status: 'rejected', reviewNote: note.slice(0, 200) });
export const removeLore = (id: string) => deleteDoc(doc(db, 'lore', id));

export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  note: string;
  by: string;
  at?: Timestamp;
}
export const addEvent = (me: Me, e: Pick<TimelineEvent, 'date' | 'title' | 'note'>) =>
  addDoc(collection(db, 'timeline'), { date: e.date, title: e.title.slice(0, 80), note: e.note.slice(0, 300), by: me.id, at: serverTimestamp() });
export const removeEvent = (id: string) => deleteDoc(doc(db, 'timeline', id));

/** One reaction per member per entry. */
export const REACTS = ['🔥', '👑', '🩸', '🥃', '💀'];
export interface React {
  id: string;
  target: string;
  memberId: string;
  emoji: string;
}
export const react = (me: string, target: string, emoji: string | null) =>
  emoji ? setDoc(doc(db, 'archiveReacts', `${target}_${me}`), { target, memberId: me, emoji }) : deleteDoc(doc(db, 'archiveReacts', `${target}_${me}`));
