import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useDoc } from '../hooks/useCollection';
import { db } from './firebase';

/** One thing on my shopping list: what, how many, and which kit wanted it. */
export interface ShopItem {
  item: string;
  qty: number;
  from?: string;
}

/** My own shopping list. Only I see it. */
export function useShopping(me: string) {
  const d = useDoc<{ items?: ShopItem[] }>(`shopping/${me}`);
  return d === undefined ? null : (d?.items ?? []);
}

export const saveShopping = (me: string, items: ShopItem[]) => setDoc(doc(db, 'shopping', me), { items: items.slice(0, 100) });

/** Adds to the list; an item already on it keeps the bigger count. */
export function addToShopping(me: string, list: ShopItem[], adds: ShopItem[]) {
  const next = [...list];
  adds.forEach((a) => {
    const i = next.findIndex((x) => x.item === a.item);
    if (i >= 0) next[i] = { ...next[i]!, qty: Math.max(next[i]!.qty, a.qty) };
    else next.push(a);
  });
  return saveShopping(me, next);
}

/** Puts a request on the gang wish list (BlackMarket). */
export const askGang = (me: { id: string; name: string }, title: string, qty: number, notes: string) =>
  addDoc(collection(db, 'wishes'), { title: title.slice(0, 60), qty, notes: notes.slice(0, 200), fields: {}, byId: me.id, byName: me.name, status: 'open', claimerId: null, claimerName: null, at: serverTimestamp() });
