import { addDoc, collection, deleteDoc, doc, query, serverTimestamp, setDoc, updateDoc, where, type Timestamp } from 'firebase/firestore';
import { useMemo } from 'react';
import { useCollection, useDoc } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { PRODUCTS, STRAINS, toCount, type BudField, type RootField, type StrainId } from '../noel/data';
import { useOps } from '../noel/ops';
import { countSale } from './boards';
import { db } from './firebase';
import { bucketOf, noelSale, removeNoelSale } from './noelops';

/** What the BlackMarket sells: every strain's bricks, coke bricks and meth bins. */
export const SALE_ITEMS = [
  ...STRAINS.map((s) => ({ id: s.id as string, name: s.name, tint: s.tint, nameColor: s.nameColor, unit: 'brick', strain: s.id as StrainId, field: 'bricks' as BudField | RootField })),
  ...PRODUCTS.map((p) => ({ id: p.id as string, name: p.name, tint: p.tint, nameColor: p.nameColor, unit: p.unit, strain: undefined, field: p.id as BudField | RootField })),
];
export const saleItem = (id: string) => SALE_ITEMS.find((x) => x.id === id);
export const unitWord = (id: string, n: number) => {
  const u = saleItem(id)?.unit ?? 'brick';
  return n === 1 ? u : `${u}s`;
};

export interface Sale {
  id: string;
  product: string;
  qty: number;
  /** Where it came from: a stash id, or a locker storage path. */
  from: string;
  fromLabel: string;
  sellerId: string;
  sellerName: string;
  /** Seller's cut % at the time. */
  cut: number;
  price: number | null;
  narco?: boolean;
  /** The same sale in NoelOps' log. */
  noelKey?: string;
  note?: string;
  byName?: string;
  at?: Timestamp;
}

export interface Wash {
  id: string;
  memberId: string;
  memberName: string;
  dirty: number;
  pct: number;
  clean: number;
  note?: string;
  byName?: string;
  at?: Timestamp;
}

export interface LedgerEntry {
  id: string;
  type: 'payout' | 'expense';
  amount: number;
  toId?: string | null;
  toName?: string;
  note?: string;
  byName?: string;
  at?: Timestamp;
}

export type WishStatus = 'open' | 'claimed' | 'done' | 'cancelled';
export interface Wish {
  id: string;
  title: string;
  qty: number;
  notes?: string;
  fields?: Record<string, string>;
  byId: string;
  byName: string;
  status: WishStatus;
  claimerId?: string | null;
  claimerName?: string | null;
  at?: Timestamp;
  doneAt?: Timestamp;
}

export interface BmSettings {
  prices?: Record<string, number>;
  defaultCut?: number;
  cuts?: Record<string, number>;
  washPct?: number;
  wishFields?: { id: string; label: string }[];
}

export const money = (v: number) => `$${Math.round(Math.max(0, v)).toLocaleString('en-US')}`;
const ms = (t?: Timestamp) => t?.toMillis() ?? Date.now();

export interface PersonMoney {
  id: string;
  name: string;
  qty: number;
  sold: number;
  earned: number;
  paid: number;
  owed: number;
  dirtyIn: number;
  washed: number;
  clean: number;
  held: number;
  lost: number;
}

/**
 * The BlackMarket's books. With the money power you see everyone's; without it,
 * only your own sales, washes and payouts.
 */
export function useMoney() {
  const { me, can, memberById } = useHub();
  const all = can('money');
  const salesQ = useMemo(() => (all ? query(collection(db, 'sales')) : query(collection(db, 'sales'), where('sellerId', '==', me.id))), [all, me.id]);
  const washQ = useMemo(() => (all ? query(collection(db, 'washes')) : query(collection(db, 'washes'), where('memberId', '==', me.id))), [all, me.id]);
  const ledgerQ = useMemo(() => (all ? query(collection(db, 'ledger')) : query(collection(db, 'ledger'), where('toId', '==', me.id))), [all, me.id]);
  const sales = useCollection<Sale>(salesQ);
  const washes = useCollection<Wash>(washQ);
  const ledger = useCollection<LedgerEntry>(ledgerQ);
  const wishes = useCollection<Wish>('wishes');
  const settings = useDoc<BmSettings & { id: string }>('settings/blackmarket');

  return useMemo(() => {
    const s: BmSettings = settings ?? {};
    const sorted = [...(sales ?? [])].sort((a, b) => ms(b.at) - ms(a.at));
    const people = new Map<string, PersonMoney>();
    const get = (id: string, name: string) => {
      if (!people.has(id)) people.set(id, { id, name: memberById.get(id)?.name ?? name, qty: 0, sold: 0, earned: 0, paid: 0, owed: 0, dirtyIn: 0, washed: 0, clean: 0, held: 0, lost: 0 });
      return people.get(id)!;
    };
    sorted.forEach((x) => {
      const p = get(x.sellerId, x.sellerName);
      p.qty += x.qty;
      if (x.price) {
        p.sold += x.price;
        p.dirtyIn += x.price;
        p.earned += Math.round((x.price * (x.cut ?? 0)) / 100);
      }
    });
    (washes ?? []).forEach((w) => {
      const p = get(w.memberId, w.memberName);
      p.washed += w.dirty;
      p.clean += w.clean;
    });
    (ledger ?? []).forEach((l) => {
      if (l.type === 'payout' && l.toId) get(l.toId, l.toName ?? '').paid += l.amount;
    });
    people.forEach((p) => {
      p.owed = Math.max(0, p.earned - p.paid);
      p.held = Math.max(0, p.dirtyIn - p.washed);
      p.lost = p.washed - p.clean;
    });
    const income = sorted.reduce((t, x) => t + (x.price ?? 0), 0);
    const payouts = (ledger ?? []).filter((l) => l.type === 'payout').reduce((t, l) => t + l.amount, 0);
    const expenses = (ledger ?? []).filter((l) => l.type === 'expense').reduce((t, l) => t + l.amount, 0);
    return {
      ready: !!sales && !!washes && !!ledger && !!wishes && settings !== undefined,
      all,
      sales: sorted,
      washes: [...(washes ?? [])].sort((a, b) => ms(b.at) - ms(a.at)),
      ledger: [...(ledger ?? [])].sort((a, b) => ms(b.at) - ms(a.at)),
      wishes: wishes ?? [],
      settings: s,
      prices: s.prices ?? {},
      defaultCut: s.defaultCut ?? 20,
      washPct: s.washPct ?? 50,
      cutFor: (memberId: string) => s.cuts?.[memberId] ?? s.defaultCut ?? 20,
      people: [...people.values()],
      mine: people.get(me.id) ?? get(me.id, me.name),
      bank: income - payouts - expenses,
      income,
      payouts,
      expenses,
    };
  }, [sales, washes, ledger, wishes, settings, all, me.id, me.name, memberById]);
}

/** BlackMarket actions. Selling takes the product out of a stash or your own locker storage. */
export function useMoneyOps() {
  const { me } = useHub();
  const ops = useOps('blackmarket');
  const sign = { _by: me.id, _via: ops.via };
  return {
    async sell(p: { product: string; qty: number; from: string; fromLabel: string; seller: { id: string; name: string }; cut: number; price: number | null; narco: boolean; note: string }) {
      const item = saleItem(p.product)!;
      const taken = await ops.applyDeltas([{ loc: p.from, strain: item.strain, field: item.field, delta: -p.qty }]);
      if (!taken.length || -taken[0]!.delta < p.qty) {
        if (taken.length) await ops.reverse(taken)();
        return null;
      }
      // NoelOps gets the sale too (its sales log and feed); the HQ copy remembers its key so it can be taken back out.
      const ref = doc(collection(db, 'sales'));
      const noelKey = await noelSale({
        strain: p.product, bricks: p.qty, bucket: bucketOf(p.from) ?? `HQ · ${p.fromLabel}`, who: p.seller.name, by: me.name,
        cut: p.cut, price: p.price, note: p.note.slice(0, 60), narco: p.narco, hqId: ref.id,
      }).catch(() => null);
      await setDoc(ref, {
        product: p.product,
        qty: p.qty,
        from: p.from,
        fromLabel: p.fromLabel,
        sellerId: p.seller.id,
        sellerName: p.seller.name,
        cut: p.cut,
        price: p.price,
        narco: p.narco,
        note: p.note.slice(0, 60),
        byName: me.name,
        at: serverTimestamp(),
        ...(noelKey ? { noelKey } : {}),
        ...sign,
      }).catch(async (e) => {
        if (noelKey) await removeNoelSale(noelKey);
        await ops.reverse(taken)();
        throw e;
      });
      if (p.price) countSale(sign, p.seller.id, p.price);
      return {
        text: `Sold ${p.qty} × ${item.name}${p.price ? ` for ${money(p.price)} dirty` : ''}.`,
        undo: () => Promise.all([ops.reverse(taken)(), deleteDoc(ref).catch(() => {}), noelKey ? removeNoelSale(noelKey) : null, p.price ? countSale(sign, p.seller.id, -p.price) : null]),
      };
    },
    /** Money power: take a sale back out and return the product to where it came from. */
    async removeSale(x: Sale) {
      const item = saleItem(x.product)!;
      await ops.applyDeltas([{ loc: x.from, strain: item.strain, field: item.field, delta: x.qty }]);
      await deleteDoc(doc(db, 'sales', x.id));
      if (x.noelKey) await removeNoelSale(x.noelKey);
      if (x.price) await countSale(sign, x.sellerId, -x.price, x.at);
    },
    wash: (w: { memberId: string; memberName: string; dirty: number; pct: number; note: string }) =>
      addDoc(collection(db, 'washes'), { ...w, clean: Math.round((w.dirty * (100 - w.pct)) / 100), byName: me.name, at: serverTimestamp(), ...sign }),
    removeWash: (id: string) => deleteDoc(doc(db, 'washes', id)),
    addLedger: (e: Omit<LedgerEntry, 'id' | 'at' | 'byName'>) => addDoc(collection(db, 'ledger'), { ...e, byName: me.name, at: serverTimestamp() }),
    removeLedger: (id: string) => deleteDoc(doc(db, 'ledger', id)),
    saveSettings: (patch: Partial<BmSettings>) => setDoc(doc(db, 'settings', 'blackmarket'), patch, { merge: true }),
    postWish: (w: { title: string; qty: number; notes: string; fields: Record<string, string> }) =>
      addDoc(collection(db, 'wishes'), { ...w, byId: me.id, byName: me.name, status: 'open', claimerId: null, claimerName: null, at: serverTimestamp() }),
    wishAction(w: Wish, action: 'claim' | 'unclaim' | 'done' | 'cancel') {
      const ref = doc(db, 'wishes', w.id);
      if (action === 'claim') return updateDoc(ref, { status: 'claimed', claimerId: me.id, claimerName: me.name });
      if (action === 'unclaim') return updateDoc(ref, { status: 'open', claimerId: null, claimerName: null });
      if (action === 'done') return updateDoc(ref, { status: 'done', doneAt: serverTimestamp() });
      return updateDoc(ref, { status: 'cancelled', doneAt: serverTimestamp() });
    },
  };
}

export { toCount };
