import { addDoc, collection, deleteDoc, doc, query, serverTimestamp, setDoc, updateDoc, where, type Timestamp } from 'firebase/firestore';
import { useMemo } from 'react';
import { useCollection, useDoc } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { PRODUCTS, STRAINS, toCount, type BudField, type RootField, type StrainId } from '../noel/data';
import { useOps } from '../noel/ops';
import { countSale } from './boards';
import type { CashMove } from './trades';

/** Cash a member adds to (or takes out of) their own locker. Negative takes it out. */
export interface MyCash {
  id: string;
  memberId: string;
  dirty: number;
  clean: number;
  note?: string;
  at?: Timestamp;
}
export const addMyCash = (memberId: string, dirty: number, clean: number, note: string) =>
  addDoc(collection(db, 'myCash'), { memberId, dirty: Math.round(dirty), clean: Math.round(clean), note: note.trim().slice(0, 60), at: serverTimestamp() });
import { db } from './firebase';
import { bucketOf, noelSale, removeNoelSale } from './noelops';

/** What the BlackMarket sells: every strain's bricks, coke bricks and meth bins. */
export const SALE_ITEMS = [
  ...STRAINS.map((s) => ({ id: s.id as string, name: s.name, tint: s.tint, nameColor: s.nameColor, unit: 'brick', strain: s.id as StrainId, field: 'bricks' as BudField | RootField })),
  ...PRODUCTS.map((p) => ({ id: p.id as string, name: p.name, tint: p.tint, nameColor: p.nameColor, unit: p.unit, strain: undefined, field: p.id as BudField | RootField })),
];
interface SaleItem {
  id: string;
  name: string;
  tint: string;
  nameColor: string;
  unit: string;
  strain: StrainId | undefined;
  field: BudField | RootField;
  /** A catalog item sold as a product (taken from the stash's items). */
  item?: string;
  retired?: boolean;
}
/** Catalog items an admin added as products (Admin → Lists). Set by the BlackMarket page from the saved list. */
let EXTRA: SaleItem[] = [];
export function setExtraProducts(ps: { id: string; name: string; unit: string; itemId: string; retired?: boolean }[]) {
  EXTRA = ps.map((p) => ({ id: p.id, name: p.name, tint: '212,175,55', nameColor: 'text-gold-200', unit: p.unit, strain: undefined, field: 'meth' as BudField | RootField, item: p.itemId, retired: !!p.retired }));
}
/** Everything that can be sold right now: the NoelOps drugs plus live catalog products. */
export const saleItems = (): SaleItem[] => [...SALE_ITEMS, ...EXTRA.filter((x) => !x.retired)];
export const saleItem = (id: string): SaleItem | undefined => SALE_ITEMS.find((x) => x.id === id) ?? EXTRA.find((x) => x.id === id);
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
  /** Gang (from a gang stash: the money is the gang's) or personal (from my locker: the money is mine). Older sales have none. */
  kind?: SaleKind;
  /** Who went along on the Narco call. */
  team?: string[];
  /** Lines sold on the same Narco call share this. */
  callId?: string;
  at?: Timestamp;
}
export type SaleKind = 'gang' | 'personal';
/** A sale's kind; older sales go by where the product came from. */
export const saleKind = (x: Pick<Sale, 'kind' | 'from'>): SaleKind => x.kind ?? (x.from.startsWith('lockerStock/') ? 'personal' : 'gang');

/** Dirty money the call's leader paid to someone who came along: out of the sale itself, or out of their own pocket. */
export interface TeamPay {
  id: string;
  callId: string;
  /** The first sale of the call, for the rules to check. */
  saleId: string;
  from: string;
  to: string;
  dirty: number;
  source: 'sale' | 'mine';
  /** How much of it came out of the gang's share of the sale. */
  fromBank: number;
  at?: Timestamp;
}

/** Dirty money a member sends to the family's washers. It leaves their locker now; the clean comes back when it's done. */
export type WashStatus = 'open' | 'claimed' | 'done' | 'cancelled';
export interface WashRequest {
  id: string;
  memberId: string;
  memberName: string;
  dirty: number;
  /** % lost in the wash, e.g. 50. */
  pct: number;
  clean: number;
  status: WashStatus;
  claimerId?: string | null;
  claimerName?: string | null;
  note?: string;
  at?: Timestamp;
  doneAt?: Timestamp;
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
  /** A catalog item, so the asker can drop it into their locker when it's done. */
  itemId?: string | null;
  /** What the asker will pay. */
  offer?: number;
  /** Leadership: pinned to the top, or marked urgent. */
  priority?: 'pinned' | 'urgent' | null;
  /** The asker put the item in their locker. */
  received?: boolean;
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

/** Splits a call's payout from the sale: out of the gang's share first, then out of the leader's personal share. */
export function payoutSplit(callSales: Sale[], pays: TeamPay[], amount: number, source: 'sale' | 'mine') {
  if (source === 'mine') return { fromBank: 0, room: Infinity };
  const gang = callSales.filter((x) => saleKind(x) === 'gang').reduce((t, x) => t + (x.price ?? 0), 0);
  const total = callSales.reduce((t, x) => t + (x.price ?? 0), 0);
  const usedBank = pays.filter((p) => p.source === 'sale').reduce((t, p) => t + p.fromBank, 0);
  const usedAll = pays.filter((p) => p.source === 'sale').reduce((t, p) => t + p.dirty, 0);
  return { fromBank: Math.max(0, Math.min(amount, gang - usedBank)), room: Math.max(0, total - usedAll) };
}

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
  const washer = can('washMoney');
  // Narco sales are public to the family; personal amounts are hidden on screen.
  const salesQ = useMemo(() => query(collection(db, 'sales')), []);
  const tpAll = useMemo(() => query(collection(db, 'teamPays')), []);
  const tpFrom = useMemo(() => query(collection(db, 'teamPays'), where('from', '==', me.id)), [me.id]);
  const tpTo = useMemo(() => query(collection(db, 'teamPays'), where('to', '==', me.id)), [me.id]);
  const paysAll = useCollection<TeamPay>(tpAll, all);
  const paysFrom = useCollection<TeamPay>(tpFrom, !all);
  const paysTo = useCollection<TeamPay>(tpTo, !all);
  const pays = all ? paysAll : paysFrom && paysTo ? [...new Map([...paysFrom, ...paysTo].map((p) => [p.id, p])).values()] : null;
  const wrAll = useMemo(() => query(collection(db, 'washRequests')), []);
  const wrMine = useMemo(() => query(collection(db, 'washRequests'), where('memberId', '==', me.id)), [me.id]);
  const reqsAll = useCollection<WashRequest>(wrAll, all || washer);
  const reqsMine = useCollection<WashRequest>(wrMine, !(all || washer));
  const washReqs = all || washer ? reqsAll : reqsMine;
  const washQ = useMemo(() => (all ? query(collection(db, 'washes')) : query(collection(db, 'washes'), where('memberId', '==', me.id))), [all, me.id]);
  const ledgerQ = useMemo(() => (all ? query(collection(db, 'ledger')) : query(collection(db, 'ledger'), where('toId', '==', me.id))), [all, me.id]);
  const sales = useCollection<Sale>(salesQ);
  const washes = useCollection<Wash>(washQ);
  const ledger = useCollection<LedgerEntry>(ledgerQ);
  const wishes = useCollection<Wish>('wishes');
  // Money traded between members.
  const cmAll = useMemo(() => query(collection(db, 'cashMoves')), []);
  const cmFrom = useMemo(() => query(collection(db, 'cashMoves'), where('from', '==', me.id)), [me.id]);
  const cmTo = useMemo(() => query(collection(db, 'cashMoves'), where('to', '==', me.id)), [me.id]);
  const movesAll = useCollection<CashMove>(cmAll, all);
  const movesFrom = useCollection<CashMove>(cmFrom, !all);
  const movesTo = useCollection<CashMove>(cmTo, !all);
  const moves = all ? movesAll : movesFrom && movesTo ? [...movesFrom, ...movesTo] : null;
  // Cash members put in (or took out of) their own locker: money from the city, not from gang sales.
  const pcAll = useMemo(() => query(collection(db, 'myCash')), []);
  const pcMine = useMemo(() => query(collection(db, 'myCash'), where('memberId', '==', me.id)), [me.id]);
  const ownAll = useCollection<MyCash>(pcAll, all);
  const ownMine = useCollection<MyCash>(pcMine, !all);
  const own = all ? ownAll : ownMine;
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
      // Only my own sales count toward my money: everyone can see the log now.
      if (!all && x.sellerId !== me.id) return;
      const p = get(x.sellerId, x.sellerName);
      p.qty += x.qty;
      if (x.price) {
        p.sold += x.price;
        // A gang sale's money is the gang's; older sales (no kind) stayed with the seller, as before.
        if (!x.kind || x.kind === 'personal') p.dirtyIn += x.price;
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
    const moved = new Map<string, { dirty: number; clean: number }>();
    const add = (id: string, d: number, c: number) => moved.set(id, { dirty: (moved.get(id)?.dirty ?? 0) + d, clean: (moved.get(id)?.clean ?? 0) + c });
    (pays ?? []).forEach((tp) => {
      add(tp.from, -(tp.dirty - tp.fromBank), 0);
      add(tp.to, tp.dirty, 0);
      get(tp.from, '');
      get(tp.to, '');
    });
    (washReqs ?? []).forEach((w) => {
      // The gang's own washing is in the gang books, not anyone's pocket.
      if (w.status === 'cancelled' || w.memberId === 'gang') return;
      add(w.memberId, -w.dirty, w.status === 'done' ? w.clean : 0);
      get(w.memberId, w.memberName);
    });
    (own ?? []).forEach((c) => {
      add(c.memberId, c.dirty ?? 0, c.clean ?? 0);
      get(c.memberId, '');
    });
    (moves ?? []).forEach((mv) => {
      add(mv.from, -mv.dirty, -mv.clean);
      add(mv.to, mv.dirty, mv.clean);
      get(mv.from, '');
      get(mv.to, '');
    });
    people.forEach((p) => {
      const mv = moved.get(p.id);
      p.owed = Math.max(0, p.earned - p.paid);
      p.held = Math.max(0, p.dirtyIn - p.washed + (mv?.dirty ?? 0));
      p.lost = p.washed - p.clean;
      p.clean += mv?.clean ?? 0;
    });
    const gangSales = sorted.filter((x) => saleKind(x) === 'gang' || !x.kind);
    const income = gangSales.reduce((t, x) => t + (x.price ?? 0), 0) - (pays ?? []).reduce((t, p) => t + p.fromBank, 0);
    const payouts = (ledger ?? []).filter((l) => l.type === 'payout').reduce((t, l) => t + l.amount, 0);
    const expenses = (ledger ?? []).filter((l) => l.type === 'expense').reduce((t, l) => t + l.amount, 0);
    return {
      ready: !!sales && !!washes && !!ledger && !!wishes && settings !== undefined && !!moves && !!own && !!pays && !!washReqs,
      all,
      washer,
      pays: pays ?? [],
      washReqs: [...(washReqs ?? [])].sort((a, b) => ms(b.at) - ms(a.at)),
      sales: sorted,
      washes: [...(washes ?? [])].sort((a, b) => ms(b.at) - ms(a.at)),
      ledger: [...(ledger ?? [])].sort((a, b) => ms(b.at) - ms(a.at)),
      wishes: wishes ?? [],
      settings: s,
      prices: s.prices ?? {},
      defaultCut: s.defaultCut ?? 20,
      washPct: s.washPct ?? 50,
      /** Narco sales pay no cut; the call's leader pays the team out of the sale instead. */
      cutFor: (_memberId: string) => 0,
      people: [...people.values()],
      mine: people.get(me.id) ?? get(me.id, me.name),
      bank: income - payouts - expenses,
      income,
      payouts,
      expenses,
    };
  }, [sales, washes, ledger, wishes, settings, moves, own, pays, washReqs, all, me.id, me.name, memberById]);
}

/** BlackMarket actions. Selling takes the product out of a stash or your own locker storage. */
export function useMoneyOps() {
  const { me } = useHub();
  const ops = useOps('blackmarket');
  const sign = { _by: me.id, _via: ops.via };
  return {
    async sell(p: { product: string; qty: number; from: string; fromLabel: string; seller: { id: string; name: string }; cut: number; price: number | null; narco: boolean; note: string; kind: SaleKind; team: string[]; callId: string }) {
      const item = saleItem(p.product)!;
      const taken = await ops.applyDeltas([{ loc: p.from, strain: item.strain, field: item.field, item: item.item, delta: -p.qty }]);
      if (!taken.length || -taken[0]!.delta < p.qty) {
        if (taken.length) await ops.reverse(taken)();
        return null;
      }
      // NoelOps gets the sale too (its sales log and feed); the HQ copy remembers its key so it can be taken back out.
      const ref = doc(collection(db, 'sales'));
      // Catalog products don't go in NoelOps' drug sales log.
      const noelKey = item.item ? null : await noelSale({
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
        kind: p.kind,
        team: p.team.slice(0, 12),
        callId: p.callId,
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
        id: ref.id,
        text: `Sold ${p.qty} × ${item.name}${p.price ? ` for ${money(p.price)} dirty` : ''}.`,
        undo: () => Promise.all([ops.reverse(taken)(), deleteDoc(ref).catch(() => {}), noelKey ? removeNoelSale(noelKey) : null, p.price ? countSale(sign, p.seller.id, -p.price) : null]),
      };
    },
    /** Money power: take a sale back out and return the product to where it came from. */
    async removeSale(x: Sale) {
      const item = saleItem(x.product)!;
      await ops.applyDeltas([{ loc: x.from, strain: item.strain, field: item.field, item: item.item, delta: x.qty }]);
      await deleteDoc(doc(db, 'sales', x.id));
      if (x.noelKey) await removeNoelSale(x.noelKey);
      if (x.price) await countSale(sign, x.sellerId, -x.price, x.at);
    },
    wash: (w: { memberId: string; memberName: string; dirty: number; pct: number; note: string }) =>
      addDoc(collection(db, 'washes'), { ...w, clean: Math.round((w.dirty * (100 - w.pct)) / 100), byName: me.name, at: serverTimestamp(), ...sign }),
    removeWash: (id: string) => deleteDoc(doc(db, 'washes', id)),
    /** The call's leader pays someone who came along. */
    payTeam: (t: Omit<TeamPay, 'id' | 'at'>) => addDoc(collection(db, 'teamPays'), { ...t, at: serverTimestamp() }),
    requestWash: (dirty: number, pct: number, note: string) =>
      addDoc(collection(db, 'washRequests'), {
        memberId: me.id, memberName: me.name, dirty, pct, clean: Math.round((dirty * (100 - pct)) / 100), status: 'open', claimerId: null, claimerName: null, note: note.slice(0, 80), at: serverTimestamp(),
      }),
    /** The Treasurer sends the gang's dirty money to the washers; the clean comes back to the gang bank. */
    requestGangWash: (dirty: number, pct: number, note: string) =>
      addDoc(collection(db, 'washRequests'), {
        memberId: 'gang', memberName: 'The gang', dirty, pct, clean: Math.round((dirty * (100 - pct)) / 100), status: 'open', claimerId: null, claimerName: null, note: note.slice(0, 80), at: serverTimestamp(),
      }),
    washStep(w: WashRequest, step: 'claim' | 'unclaim' | 'done' | 'cancel') {
      const ref = doc(db, 'washRequests', w.id);
      if (step === 'claim') return updateDoc(ref, { status: 'claimed', claimerId: me.id, claimerName: me.name });
      if (step === 'unclaim') return updateDoc(ref, { status: 'open', claimerId: null, claimerName: null });
      if (step === 'done') return updateDoc(ref, { status: 'done', doneAt: serverTimestamp() });
      return updateDoc(ref, { status: 'cancelled', doneAt: serverTimestamp() });
    },
    addLedger: (e: Omit<LedgerEntry, 'id' | 'at' | 'byName'>) => addDoc(collection(db, 'ledger'), { ...e, byName: me.name, at: serverTimestamp() }),
    removeLedger: (id: string) => deleteDoc(doc(db, 'ledger', id)),
    saveSettings: (patch: Partial<BmSettings>) => setDoc(doc(db, 'settings', 'blackmarket'), patch, { merge: true }),
    postWish: (w: { title: string; qty: number; notes: string; fields: Record<string, string>; itemId?: string | null; offer?: number }) =>
      addDoc(collection(db, 'wishes'), { ...w, byId: me.id, byName: me.name, status: 'open', claimerId: null, claimerName: null, at: serverTimestamp() }),
    setWishPriority: (w: Wish, priority: Wish['priority']) => updateDoc(doc(db, 'wishes', w.id), { priority: priority ?? null }),
    markReceived: (w: Wish) => updateDoc(doc(db, 'wishes', w.id), { received: true }),
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
