import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc, type Timestamp } from 'firebase/firestore';
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
  /** Who saved it to their list. */
  saves?: Record<string, boolean>;
  tags?: string[];
  /** Family (true) or just me. Old builds have no flag and are family builds. */
  public?: boolean;
  at?: Timestamp;
}

export const BUILD_TAGS = ['Blacksite', 'Run', 'Heist', 'CQB', 'Long range', 'Defense', 'Budget', 'Stealth'];

/** A gun on a character: the gun plus the attachments on it (from their locker). */
export interface Carried {
  item: string;
  parts: Record<string, string>;
}

/** The old one-per-member loadout. Kits replaced it; it's read once to make a member's first kit. */
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

export const saveBuild = (me: { id: string; name: string }, b: Pick<Build, 'name' | 'weaponId' | 'parts' | 'notes' | 'tags' | 'public'>, id?: string) =>
  id
    ? updateDoc(doc(db, 'builds', id), { ...b }).then(() => id)
    : addDoc(collection(db, 'builds'), { ...b, by: me.id, byName: me.name, likes: {}, saves: {}, at: serverTimestamp() }).then((r) => r.id);
export const removeBuild = (id: string) => deleteDoc(doc(db, 'builds', id));
export const likeBuild = (id: string, me: string, on: boolean) => updateDoc(doc(db, 'builds', id), { [`likes.${me}`]: on });
export const keepBuild = (id: string, me: string, on: boolean) => updateDoc(doc(db, 'builds', id), { [`saves.${me}`]: on });
export const markBuildPublic = (id: string) => updateDoc(doc(db, 'builds', id), { public: true });
