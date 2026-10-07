import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, writeBatch, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { OpsLocation, StockDoc } from '../noel/data';
import { thingKey, thingsIn, type Thing } from './locker';
import type { Member, Rank } from './types';

/** Who may do what at a stash house. Leadership, admins and owners can do everything. */
export function stashAccess(loc: OpsLocation, me: Member, myRank: Rank | undefined, rankById: Map<string, Rank>, lead: boolean) {
  const manage = lead || !!me.admin || !!loc.owners?.includes(me.id);
  const atLeast = (rankId?: string | null) => !rankId || (myRank != null && (rankById.get(rankId)?.order ?? 999) >= myRank.order);
  const see = manage || atLeast(loc.seeRank);
  return { manage, see, take: manage || (see && atLeast(loc.takeRank)) };
}

/** One line in the stash log: a move of something, from somewhere, to somewhere. */
export type MoveKind = 'take' | 'return' | 'deposit' | 'edit' | 'transfer' | 'lost' | 'seized' | 'sold' | 'loot' | 'create';
export interface StashMove {
  id: string;
  kind: MoveKind;
  by: string;
  byName: string;
  /** Where it left (a stash id or locker path), and where it went. */
  from?: string | null;
  to?: string | null;
  fromLabel?: string;
  toLabel?: string;
  key: string;
  label: string;
  qty: number;
  at?: Timestamp;
}

/** Writes moves to the stash log (admins read it). Never blocks the action it describes. */
export function logMoves(me: { id: string; name: string }, kind: MoveKind, things: Pick<Thing, 'item' | 'strain' | 'field' | 'label' | 'qty'>[], where: { from?: string | null; to?: string | null; fromLabel?: string; toLabel?: string }) {
  return Promise.all(
    things
      .filter((t) => t.qty)
      .map((t) =>
        addDoc(collection(db, 'stashLog'), {
          kind,
          by: me.id,
          byName: me.name,
          from: where.from ?? null,
          to: where.to ?? null,
          fromLabel: (where.fromLabel ?? '').slice(0, 60),
          toLabel: (where.toLabel ?? '').slice(0, 60),
          key: thingKey(t),
          label: t.label.slice(0, 60),
          qty: Math.abs(Math.round(t.qty)),
          at: serverTimestamp(),
        }),
      ),
  ).catch(() => []);
}

/** The day's snapshot of every stash: thing key → count. The first visitor of the day writes it. */
export async function snapshotToday(day: string, stock: Map<string, StockDoc>, itemName: (id: string) => string) {
  const ref = doc(db, 'stashSnaps', day);
  if ((await getDoc(ref).catch(() => null))?.exists()) return;
  const counts: Record<string, Record<string, number>> = {};
  stock.forEach((s, id) => {
    const m: Record<string, number> = {};
    thingsIn(s, itemName).forEach((t) => (m[thingKey(t)] = t.qty));
    if (Object.keys(m).length) counts[id] = m;
  });
  await setDoc(ref, { day, counts, at: serverTimestamp() }).catch(() => {});
}
export const removeSnap = (day: string) => deleteDoc(doc(db, 'stashSnaps', day));

/** Saves a stash's owner-level settings next to its NoelOps record. */
export const saveStashSettings = (id: string, patch: Partial<Pick<OpsLocation, 'owners' | 'seeRank' | 'takeRank' | 'mins' | 'values' | 'postal' | 'note'>>) =>
  setDoc(doc(db, 'locations', id), patch, { merge: true });

/** "Please bring it back": shows on their Dashboard until they return it or dismiss it. */
export interface Nudge {
  id: string;
  to: string;
  from: string;
  fromName: string;
  signoutId: string;
  text: string;
  at?: Timestamp;
}
export const nudge = (me: { id: string; name: string }, to: string, signoutId: string, text: string) =>
  addDoc(collection(db, 'nudges'), { to, from: me.id, fromName: me.name, signoutId, text: text.slice(0, 120), at: serverTimestamp() });
export const clearNudges = (ids: string[]) => {
  const b = writeBatch(db);
  ids.forEach((id) => b.delete(doc(db, 'nudges', id)));
  return b.commit();
};

/** Parses pasted lines like "Carbine Rifle 12", "Armor Plate x40", "12 Medkit" against the catalog. */
export function parseCounts(text: string, types: { id: string; name: string }[]) {
  const byName = new Map(types.map((t) => [t.name.toLowerCase(), t]));
  return text
    .split('\n')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const m = raw.match(/^(\d+)\s*[x×]?\s+(.+)$/i) ?? raw.match(/^(.+?)\s*[x×:,-]?\s*(\d+)$/i);
      const [name, qty] = m ? (/^\d+$/.test(m[1]!) ? [m[2]!, +m[1]!] : [m[1]!, +m[2]!]) : [raw, 1];
      const clean = name.trim().replace(/\s+/g, ' ');
      const hit = byName.get(clean.toLowerCase()) ?? types.find((t) => t.name.toLowerCase().includes(clean.toLowerCase()));
      return { raw, name: clean, qty, item: hit?.id ?? null };
    });
}
