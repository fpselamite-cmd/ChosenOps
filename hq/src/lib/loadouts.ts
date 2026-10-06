import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';

/** A shared weapon build: a weapon and one attachment per slot. Anyone makes and shares them. */
export interface Build {
  id: string;
  name: string;
  weaponId: string;
  /** slot id → attachment item id */
  parts: Record<string, string>;
  notes?: string;
  by: string;
  byName: string;
  likes?: Record<string, boolean>;
  at?: Timestamp;
}

/** A gun on a character: the gun plus the attachments on it (from their locker). */
export interface Carried {
  item: string;
  parts: Record<string, string>;
}

/** What a member's character carries. Filled from their own locker. */
export interface CharLoadout {
  id: string;
  public: boolean;
  vest?: string | null;
  plates?: number;
  primary?: Carried | null;
  sidearm?: Carried | null;
  melee?: string | null;
  bag?: string | null;
  /** Molotovs, pipe bombs, tablets, meds… */
  utility?: { item: string; qty: number }[];
  at?: Timestamp;
}

export const UTILITY_SLOTS = 6;
/** Which kinds go in which slot. */
export const SLOT_KINDS = {
  vest: ['armor'],
  primary: ['gun'],
  sidearm: ['gun'],
  melee: ['melee'],
  bag: ['gear'],
  utility: ['throwable', 'tool', 'consumable', 'safety', 'ammo', 'other', 'gear'],
} as const;

export const saveBuild = (me: { id: string; name: string }, b: Pick<Build, 'name' | 'weaponId' | 'parts' | 'notes'>, id?: string) =>
  id
    ? updateDoc(doc(db, 'builds', id), { ...b })
    : addDoc(collection(db, 'builds'), { ...b, by: me.id, byName: me.name, likes: {}, at: serverTimestamp() }).then((r) => r.id);
export const removeBuild = (id: string) => deleteDoc(doc(db, 'builds', id));
export const likeBuild = (id: string, me: string, on: boolean) => updateDoc(doc(db, 'builds', id), { [`likes.${me}`]: on });

export const saveLoadout = (me: string, l: Omit<CharLoadout, 'id' | 'at'>) => setDoc(doc(db, 'loadouts', me), { ...l, at: serverTimestamp() });
export const setLoadoutPublic = (me: string, on: boolean) => setDoc(doc(db, 'loadouts', me), { public: on }, { merge: true });
