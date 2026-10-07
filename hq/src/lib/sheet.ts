import { addDoc, collection, deleteDoc, deleteField, doc, serverTimestamp, setDoc, updateDoc, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';

/**
 * A member's character sheet: everything they write about their character.
 * Rank, crews, join date and the game numbers aren't here; the app keeps those.
 */
export interface Sheet {
  id: string;
  basics?: Partial<Record<BasicKey, string>>;
  looks?: Partial<Record<LookKey, string>>;
  city?: Partial<Record<CityKey, string>>;
  story?: Partial<Record<StoryKey, string>>;
  traits?: string[];
  /** Self-rated, 0–5 stars. */
  skills?: Record<string, number>;
  customSkills?: { name: string; value: number }[];
  customFields?: { label: string; value: string }[];
  relations?: Relation[];
  song?: string;
  wanted?: { on: boolean; bounty: number; crime: string };
  /** Their star's color in the Family sky. */
  star?: string;
}

export interface Relation {
  /** A member, or nobody for an NPC/outsider. */
  memberId?: string | null;
  name: string;
  kind: string;
  note: string;
}

export const BASICS = [
  ['fullName', 'Full name'],
  ['age', 'Age'],
  ['hometown', 'Hometown'],
  ['nationality', 'Nationality'],
  ['height', 'Height'],
  ['build', 'Build'],
] as const;
export type BasicKey = (typeof BASICS)[number][0];

export const LOOKS = [
  ['hair', 'Hair'],
  ['eyes', 'Eyes'],
  ['marks', 'Tattoos & scars'],
  ['outfit', 'Signature outfit'],
  ['distinct', 'Distinguishing marks'],
] as const;
export type LookKey = (typeof LOOKS)[number][0];

export const CITY = [
  ['job', 'Job / front'],
  ['vehicles', 'Vehicles'],
  ['homePostal', 'Home postal'],
  ['hangout', 'Favorite hangout'],
] as const;
export type CityKey = (typeof CITY)[number][0];

export const STORY = [
  ['quote', 'Quote / motto'],
  ['backstory', 'Backstory'],
  ['joined', 'How they joined the family'],
  ['goals', 'Goals'],
  ['fears', 'Fears'],
] as const;
export type StoryKey = (typeof STORY)[number][0];
export const LONG_STORY: StoryKey[] = ['backstory', 'joined'];

export const SKILL_GROUPS = [
  { name: 'Combat', skills: ['Shooting', 'Melee', 'Tactics'] },
  { name: 'Street', skills: ['Driving', 'Stealth', 'Lockpicking', 'Hacking'] },
  { name: 'People', skills: ['Charisma', 'Intimidation', 'Negotiation'] },
  { name: 'Trade', skills: ['Cooking', 'Growing', 'Mechanic', 'Medic'] },
];

export const RELATION_KINDS = ['Friend', 'Rival', 'Partner', 'Mentor', 'Protégé', 'Family', 'Owes me', 'I owe', 'Enemy', 'Contact'];

export const saveSheet = (memberId: string, s: Omit<Sheet, 'id'>) => setDoc(doc(db, 'sheets', memberId), s);
export const setStar = (memberId: string, star: string) => setDoc(doc(db, 'sheets', memberId), { star }, { merge: true });

/** Turns a YouTube or Spotify link into something that plays inline. */
export function songEmbed(url: string | undefined) {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return { kind: 'youtube' as const, src: `https://www.youtube.com/embed/${yt[1]}?autoplay=1` };
  const sp = url.match(/open\.spotify\.com\/(?:intl-\w+\/)?(track|album|playlist)\/(\w+)/);
  if (sp) return { kind: 'spotify' as const, src: `https://open.spotify.com/embed/${sp[1]}/${sp[2]}` };
  return null;
}

// ---------- Journal ----------

export interface JournalEntry {
  id: string;
  memberId: string;
  title: string;
  text: string;
  /** Private unless the member shares it. */
  public: boolean;
  at?: Timestamp;
  /** member id → emoji */
  reactions?: Record<string, string>;
}
export const REACTIONS = ['🔥', '😂', '💀', '👑', '❤️', '😮'];

export const addEntry = (memberId: string, e: { title: string; text: string; public: boolean }) =>
  addDoc(collection(db, 'journal'), { memberId, ...e, reactions: {}, at: serverTimestamp() });
export const editEntry = (id: string, e: { title: string; text: string; public: boolean }) => updateDoc(doc(db, 'journal', id), e);
export const removeEntry = (id: string) => deleteDoc(doc(db, 'journal', id));
export const react = (id: string, me: string, emoji: string | null) =>
  updateDoc(doc(db, 'journal', id), { [`reactions.${me}`]: emoji ?? deleteField() });

// ---------- Leadership notes ----------

export interface LeaderNote {
  id: string;
  memberId: string;
  kind: NoteKind;
  text: string;
  by: string;
  byName: string;
  at?: Timestamp;
}
export const NOTE_KINDS = [
  { id: 'commendation', label: 'Commendation', color: '#d4af37' },
  { id: 'note', label: 'Note', color: '#9ca3af' },
  { id: 'warning', label: 'Warning', color: '#f59e0b' },
  { id: 'strike', label: 'Strike', color: '#ef4444' },
] as const;
export type NoteKind = (typeof NOTE_KINDS)[number]['id'];

export const addNote = (memberId: string, by: { id: string; name: string }, kind: NoteKind, text: string) =>
  addDoc(collection(db, 'leaderNotes'), { memberId, kind, text: text.slice(0, 300), by: by.id, byName: by.name, at: serverTimestamp() });
export const removeNote = (id: string) => deleteDoc(doc(db, 'leaderNotes', id));
