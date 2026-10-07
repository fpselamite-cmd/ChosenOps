import { addDoc, collection, deleteDoc, doc, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { useEffect, useMemo, useRef } from 'react';
import { useCollection, useDoc } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { BUD_FIELDS, ROOT_FIELDS, STRAINS, budCell, toCount, type BudField, type RootField, type StockDoc, type StrainId } from '../noel/data';
import { lockerPath, useOps } from '../noel/ops';
import { answer, createTrade, settleCash, type Cash, type Trade2 } from './trades';
import { db } from './firebase';
import { logMoves } from './stash';
import type { ItemType } from './items';

export interface Storage {
  id: string;
  name: string;
}

export interface LockerDoc {
  id: string;
  storages: Storage[];
  meta?: Record<string, ItemMeta>;
  kits?: Kit[];
}

/** A saved packing list: 'Blacksite kit', 'Run kit'… */
export interface Kit {
  id: string;
  name: string;
  items: { item: string; qty: number }[];
}

/** One thing that can move: a strain field, a product, or a catalog item. */
export interface Thing {
  strain?: StrainId;
  field: BudField | RootField;
  item?: string;
  qty: number;
  /** Human label, e.g. "2 × Carbine Rifle". */
  label: string;
}

export type SignoutStatus = 'out' | 'returned' | 'lost' | 'seized';
export interface Signout {
  id: string;
  memberId: string;
  memberName: string;
  fromLoc: string;
  fromLabel: string;
  storageId: string;
  thing: Thing;
  status: SignoutStatus;
  at?: import('firebase/firestore').Timestamp;
  closedAt?: import('firebase/firestore').Timestamp;
  closedBy?: string;
}

export type TradeStatus = 'pending' | 'accepted' | 'declined' | 'returned' | 'cancelled';
export interface Trade {
  id: string;
  from: string;
  fromName: string;
  fromStorage: string;
  to: string;
  toName: string;
  thing: Thing;
  note?: string;
  status: TradeStatus;
  at?: import('firebase/firestore').Timestamp;
}

/** What a member adds to any item in their locker: a picture, a note, a value, a favorite star. */
export interface ItemMeta {
  pic?: string | null;
  note?: string;
  value?: number;
  fav?: boolean;
}
/** One key per kind of thing (an item, or a strain's bricks…). */
export const thingKey = (t: Pick<Thing, 'item' | 'strain' | 'field'>) => t.item ?? `${t.strain ?? 'x'}-${t.field}`;

export const DEFAULT_STORAGES: Storage[] = [
  { id: 'onme', name: 'On Me' },
  { id: 'home', name: 'Home' },
];

/** How many of a thing a stock doc holds. */
export function countOf(s: StockDoc | undefined, t: Pick<Thing, 'strain' | 'field' | 'item'>) {
  if (t.item) return toCount(s?.items?.[t.item]);
  if (t.strain) return budCell(s, t.strain)[t.field as BudField];
  return toCount(s?.[t.field]);
}

/** Everything a stock doc holds, as a list of things. */
export function thingsIn(s: StockDoc | undefined, itemName: (id: string) => string): Thing[] {
  const out: Thing[] = [];
  STRAINS.forEach((st) =>
    BUD_FIELDS.forEach((f) => {
      const v = budCell(s, st.id)[f];
      if (v) out.push({ strain: st.id, field: f, qty: v, label: `${st.name} ${f === 'bricks' ? (v === 1 ? 'brick' : 'bricks') : f}` });
    }),
  );
  (Object.keys(ROOT_FIELDS) as RootField[]).forEach((f) => {
    const v = toCount(s?.[f]);
    if (v) out.push({ field: f, qty: v, label: ROOT_FIELDS[f] });
  });
  Object.entries(s?.items ?? {}).forEach(([id, v]) => {
    if (toCount(v)) out.push({ field: 'meth', item: id, qty: toCount(v), label: itemName(id) });
  });
  return out;
}

const delta = (loc: string, t: Thing, qty: number) => ({ loc, strain: t.strain, field: t.field, item: t.item, delta: qty });

/** My own locker: storages, what's in them, my sign-outs and trades. Private to me. */
export function useLocker() {
  const { me } = useHub();
  const ops = useOps('stash');
  const locker = useDoc<LockerDoc>(`lockers/${me.id}`);
  const stockQ = useMemo(() => query(collection(db, 'lockerStock'), where('owner', '==', me.id)), [me.id]);
  const signQ = useMemo(() => query(collection(db, 'signouts'), where('memberId', '==', me.id)), [me.id]);
  const outQ = useMemo(() => query(collection(db, 'trades'), where('from', '==', me.id)), [me.id]);
  const inQ = useMemo(() => query(collection(db, 'trades'), where('to', '==', me.id)), [me.id]);
  const stockRows = useCollection<StockDoc>(stockQ);
  const signouts = useCollection<Signout>(signQ);
  const tradesOut = useCollection<Trade>(outQ);
  const tradesIn = useCollection<Trade>(inQ);

  // Pick up what's mine from finished trades, and get my own things back from turned-down ones.
  const busy = useRef(new Set<string>());
  useEffect(() => {
    const v2 = (rows: Trade[] | null) => (rows ?? []).filter((t) => (t as unknown as Trade2).v === 2) as unknown as Trade2[];
    const once = async (key: string, fn: () => Promise<unknown>) => {
      if (busy.current.has(key)) return;
      busy.current.add(key);
      await fn().catch(() => busy.current.delete(key));
    };
    const put = (storageId: string, things: Thing[]) =>
      things.length ? ops.applyDeltas(things.map((t) => delta(lockerPath(me.id, storageId), t, t.qty))) : Promise.resolve([]);
    v2(tradesOut).forEach((t) => {
      if (t.status === 'done' && !t.fromCollected) once(`${t.id}c`, () => put(t.fromStorage, t.back ?? []).then(() => answer(t.id, { fromCollected: true })));
      if ((t.status === 'declined' || t.status === 'cancelled') && !t.giveReturned) once(`${t.id}r`, () => put(t.fromStorage, t.things).then(() => answer(t.id, { giveReturned: true })));
    });
    v2(tradesIn).forEach((t) => {
      if (t.status === 'done' && !t.toCollected) once(`${t.id}c`, () => put(t.backStorage ?? 'onme', t.things).then(() => answer(t.id, { toCollected: true })));
      if (t.status === 'declined' && (t.back ?? []).length && !t.backReturned) once(`${t.id}r`, () => put(t.backStorage ?? 'onme', t.back ?? []).then(() => answer(t.id, { backReturned: true })));
    });
  }, [tradesOut, tradesIn, me.id, ops]);

  // Every locker starts with On Me and Home.
  useEffect(() => {
    if (locker === null) setDoc(doc(db, 'lockers', me.id), { storages: DEFAULT_STORAGES }).catch(() => {});
  }, [locker, me.id]);

  const storages = locker?.storages ?? DEFAULT_STORAGES;
  const stock = new Map((stockRows ?? []).map((r) => [r.id.split('__')[1]!, r]));
  const path = (storageId: string) => lockerPath(me.id, storageId);

  return {
    meId: me.id,
    kits: (locker?.kits ?? []) as Kit[],
    saveKits: (kits: Kit[]) => setDoc(doc(db, 'lockers', me.id), { kits: kits.slice(0, 20) }, { merge: true }),
    ready: locker !== undefined && !!stockRows && !!signouts && !!tradesOut && !!tradesIn,
    storages,
    stock,
    signouts: signouts ?? [],
    tradesOut: tradesOut ?? [],
    tradesIn: tradesIn ?? [],
    path,

    meta: (locker?.meta ?? {}) as Record<string, ItemMeta>,
    /** Saves my picture / note / value / favorite for a kind of thing. */
    async setMeta(key: string, m: ItemMeta) {
      await setDoc(doc(db, 'lockers', me.id), { meta: { [key]: m } }, { merge: true });
    },

    async saveStorages(next: Storage[]) {
      await setDoc(doc(db, 'lockers', me.id), { storages: next.slice(0, 20) }, { merge: true });
    },
    async addStorage(name: string) {
      const id = `s${Date.now().toString(36)}`;
      await this.saveStorages([...storages, { id, name: name.trim().slice(0, 30) }]);
      return id;
    },
    async renameStorage(id: string, name: string) {
      await this.saveStorages(storages.map((s) => (s.id === id ? { ...s, name: name.trim().slice(0, 30) } : s)));
    },
    /** Removes a storage; anything in it moves to another one first. */
    async removeStorage(id: string, moveTo: string, itemName: (id: string) => string) {
      const things = thingsIn(stock.get(id), itemName);
      if (things.length) await this.move(things, path(id), path(moveTo));
      await this.saveStorages(storages.filter((s) => s.id !== id));
      await deleteDoc(doc(db, path(id))).catch(() => {});
    },

    /** Moves things between any two places (my storages and gang stashes). Returns what moved. */
    async move(things: Thing[], from: string, to: string) {
      const taken = await ops.applyDeltas(things.map((t) => delta(from, t, -t.qty)));
      if (taken.length) await ops.applyDeltas(taken.map((d) => ({ ...d, loc: to, delta: -d.delta })));
      return taken;
    },

    /**
     * Gives some of an item a name of its own (an event variant, an engraved gun): a new item type
     * that points at the original, and the units swap over in the same storage.
     */
    async nameIt(storageId: string, t: Thing, base: ItemType, name: string) {
      const root = base.baseId ?? base.id;
      const { id: _id, owner: _o, baseId: _b, ...copy } = base;
      void _id;
      void _o;
      void _b;
      const ref = await addDoc(collection(db, 'itemTypes'), { ...copy, name: name.trim().slice(0, 40), baseId: root, owner: me.id, _by: me.id, _via: 'rank' });
      const taken = await ops.applyDeltas([delta(path(storageId), t, -t.qty)]);
      if (taken.length) await ops.applyDeltas([{ loc: path(storageId), field: t.field, item: ref.id, delta: -taken[0]!.delta }]);
      return ref.id;
    },
    renameVariant: (itemId: string, name: string) => updateDoc(doc(db, 'itemTypes', itemId), { name: name.trim().slice(0, 40) }),

    /** Takes gang property from a stash into one of my storages, logged as signed out. */
    async signOut(fromLoc: string, fromLabel: string, storageId: string, t: Thing) {
      const taken = await this.move([t], fromLoc, path(storageId));
      if (!taken.length) return null;
      const qty = -taken[0]!.delta;
      await addDoc(collection(db, 'signouts'), {
        memberId: me.id,
        memberName: me.name,
        fromLoc,
        fromLabel,
        storageId,
        thing: { ...t, qty, label: t.label },
        status: 'out',
        at: serverTimestamp(),
      });
      ops.log('items');
      void logMoves(me, 'take', [{ ...t, qty }], { from: fromLoc, fromLabel, to: path(storageId), toLabel: `${me.name}'s locker` });
      return qty;
    },
    /** Puts signed-out property back where it came from (whatever of it is still in the storage). */
    async returnSignout(s: Signout) {
      await this.move([s.thing], path(s.storageId), s.fromLoc);
      await updateDoc(doc(db, 'signouts', s.id), { status: 'returned', closedAt: serverTimestamp(), closedBy: me.id });
      void logMoves(me, 'return', [s.thing], { from: path(s.storageId), fromLabel: `${me.name}'s locker`, to: s.fromLoc, toLabel: s.fromLabel });
    },
    /** Lost or seized: it's gone, so it comes out of the storage too. */
    async closeSignout(s: Signout, status: 'lost' | 'seized') {
      await ops.applyDeltas([delta(path(s.storageId), s.thing, -s.thing.qty)]);
      await updateDoc(doc(db, 'signouts', s.id), { status, closedAt: serverTimestamp(), closedBy: me.id });
    },

    /** Takes things out of one of my storages; returns exactly what came out (with real counts). */
    async takeOut(storageId: string, things: Thing[]) {
      const taken = await ops.applyDeltas(things.map((t) => delta(path(storageId), t, -t.qty)));
      return taken.map((d) => {
        const t = things.find((x) => x.item === d.item && x.strain === d.strain && x.field === d.field)!;
        return { ...t, qty: -d.delta };
      });
    },
    /** Puts things into one of my storages. */
    putIn: (storageId: string, things: Thing[]) => (things.length ? ops.applyDeltas(things.map((t) => delta(path(storageId), t, t.qty))) : Promise.resolve([])),

    /** A trade offer: several things and/or cash. The things leave my storage now. */
    async offerMany(storageId: string, things: Thing[], cash: Cash, to: { id: string; name: string }, note: string) {
      const held = things.length ? await this.takeOut(storageId, things) : [];
      if (things.length && !held.length) return false;
      await createTrade({ from: me.id, fromName: me.name, fromStorage: storageId, to: to.id, toName: to.name, things: held, cash, note: note.trim().slice(0, 80) });
      return true;
    },
    /** Accept an offer as it is: what they sent comes into my storage now. */
    async acceptAsIs(t: Trade2, storageId: string, reply: string) {
      await answer(t.id, { status: 'done', toCollected: true, reply: reply.trim().slice(0, 80), backStorage: storageId });
      await this.putIn(storageId, t.things);
      await settleCash(t.id);
    },
    /** Answer with things and/or cash of my own; the sender then confirms. */
    async counter(t: Trade2, storageId: string, back: Thing[], backCash: Cash, reply: string) {
      const held = back.length ? await this.takeOut(storageId, back) : [];
      await answer(t.id, { status: 'countered', back: held, backCash, backStorage: storageId, reply: reply.trim().slice(0, 80) });
    },
    declineTrade: (t: Trade2, reply: string) => answer(t.id, { status: 'declined', reply: reply.trim().slice(0, 80) }),
    /** Sender: take the counter. Their things come to me now. */
    async confirmCounter(t: Trade2, storageId: string) {
      await answer(t.id, { status: 'done', fromCollected: true });
      await this.putIn(storageId, t.back ?? []);
      await settleCash(t.id);
    },
    declineCounter: (t: Trade2) => answer(t.id, { status: 'declined' }),
    cancelOffer: (t: Trade2) => answer(t.id, { status: 'cancelled' }),

    /** Offers something to another member. It leaves my storage now and waits for them. */
    async offer(storageId: string, t: Thing, to: { id: string; name: string }, note: string) {
      const taken = await ops.applyDeltas([delta(path(storageId), t, -t.qty)]);
      if (!taken.length) return false;
      await addDoc(collection(db, 'trades'), {
        from: me.id,
        fromName: me.name,
        fromStorage: storageId,
        to: to.id,
        toName: to.name,
        thing: { ...t, qty: -taken[0]!.delta },
        note: note.trim().slice(0, 80),
        status: 'pending',
        at: serverTimestamp(),
      });
      return true;
    },
    async accept(tr: Trade, storageId: string) {
      await ops.applyDeltas([delta(path(storageId), tr.thing, tr.thing.qty)]);
      await updateDoc(doc(db, 'trades', tr.id), { status: 'accepted', closedAt: serverTimestamp() });
    },
    decline: (tr: Trade) => updateDoc(doc(db, 'trades', tr.id), { status: 'declined', closedAt: serverTimestamp() }),
    /** Gets back something I offered (cancelled while pending, or declined). */
    async takeBack(tr: Trade) {
      const b = writeBatch(db);
      b.update(doc(db, 'trades', tr.id), { status: tr.status === 'pending' ? 'cancelled' : 'returned', closedAt: serverTimestamp() });
      await b.commit();
      await ops.applyDeltas([delta(path(tr.fromStorage), tr.thing, tr.thing.qty)]);
    },
  };
}

export type Locker = ReturnType<typeof useLocker>;
