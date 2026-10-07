import { addDoc, collection, deleteDoc, doc, query, serverTimestamp, setDoc, updateDoc, where, type Timestamp } from 'firebase/firestore';
import { useMemo } from 'react';
import { useCollection, useDoc } from '../hooks/useCollection';
import { db } from './firebase';
import type { CharLoadout } from './loadouts';

/** The server hotbar: five quickslots. */
export const HOTBAR = 5;
/** Room in the bag grid. */
export const BAG_SLOTS = 20;
export const PLATE = 'ar_armor_plate';

/** One thing in a kit: an item, how many, and for guns the attachments on it. */
export interface KitSlot {
  item: string;
  qty: number;
  parts?: Record<string, string>;
}

export interface KitVehicle {
  name: string;
  cls: string;
}

/** A named set of what a member carries: Everyday, Heist, Blacksite… */
export interface GearKit {
  id: string;
  owner: string;
  name: string;
  /** The family can see it; otherwise only me (and leadership). */
  public: boolean;
  /** Real: only from my locker. Plan: anything in the catalog, with what's missing flagged. */
  mode: 'real' | 'plan';
  hotbar: (KitSlot | null)[];
  /** The bag grid, by position; gaps are empty squares. */
  bag: (KitSlot | null)[];
  vest?: string | null;
  plates?: number;
  /** The duffel or backpack itself. */
  bagType?: string | null;
  outfit?: string;
  vehicle?: KitVehicle | null;
  at?: Timestamp;
}
export type KitData = Omit<GearKit, 'id' | 'owner' | 'at'>;

export const blankKit = (name: string): KitData => ({ name, public: false, mode: 'real', hotbar: Array(HOTBAR).fill(null), bag: [], vest: null, plates: 0, bagType: null, outfit: '', vehicle: null });

const trimEnd = <T>(a: (T | null)[]) => {
  const out = [...a];
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
};
const clean = ({ name, public: pub, mode, hotbar, bag, vest, plates, bagType, outfit, vehicle }: KitData): KitData => ({
  public: pub,
  mode,
  vest: vest ?? null,
  plates: Math.max(0, Math.round(plates ?? 0)),
  bagType: bagType ?? null,
  vehicle: vehicle ?? null,
  name: name.trim().slice(0, 30) || 'Kit',
  hotbar: Array.from({ length: HOTBAR }, (_, i) => hotbar[i] ?? null),
  bag: trimEnd(bag.slice(0, BAG_SLOTS).map((s) => (s?.item ? s : null))),
  outfit: (outfit ?? '').slice(0, 200),
});

export const createKit = (owner: string, k: KitData) => addDoc(collection(db, 'kits'), { ...clean(k), owner, at: serverTimestamp() }).then((r) => r.id);
export const saveKit = (id: string, k: KitData) => updateDoc(doc(db, 'kits', id), { ...clean(k), at: serverTimestamp() });
export const removeKit = (id: string) => deleteDoc(doc(db, 'kits', id));
export const equipKit = (me: string, kit: string | null) => setDoc(doc(db, 'kitPicks', me), { kit });

/** Every kit of mine. */
export function useMyKits(me: string) {
  const q = useMemo(() => query(collection(db, 'kits'), where('owner', '==', me)), [me]);
  const kits = useCollection<GearKit>(q);
  const pick = useDoc<{ kit: string | null }>(`kitPicks/${me}`);
  return { kits: kits?.sort((a, b) => a.name.localeCompare(b.name)) ?? null, equipped: pick?.kit ?? null, pickLoaded: pick !== undefined };
}

/** Someone's equipped kit, if it's public or I may see it. `undefined` while loading. */
export function useEquippedKit(memberId: string) {
  const pick = useDoc<{ kit: string | null }>(`kitPicks/${memberId}`);
  const id = pick?.kit;
  const kit = useDoc<GearKit>(`kits/${id || '_none'}`, !!id);
  if (pick === undefined) return undefined;
  if (!id) return null;
  return kit;
}

/** Everything a kit needs on you: each item and how many. */
export function kitNeeds(k: Pick<GearKit, 'hotbar' | 'bag' | 'vest' | 'plates' | 'bagType'> | null | undefined) {
  const need = new Map<string, number>();
  const add = (id?: string | null, n = 1) => id && n > 0 && need.set(id, (need.get(id) ?? 0) + n);
  if (!k) return need;
  add(k.vest);
  add(PLATE, k.plates ?? 0);
  add(k.bagType);
  [...k.hotbar, ...k.bag].forEach((s) => {
    if (!s) return;
    add(s.item, s.qty || 1);
    Object.values(s.parts ?? {}).forEach((p) => add(p));
  });
  return need;
}

/** Turns the old one-per-member loadout into a kit. */
export function fromLoadout(l: CharLoadout): KitData {
  const k = blankKit('Everyday');
  const slots: KitSlot[] = [];
  if (l.primary) slots.push({ item: l.primary.item, qty: 1, parts: l.primary.parts ?? {} });
  if (l.sidearm) slots.push({ item: l.sidearm.item, qty: 1, parts: l.sidearm.parts ?? {} });
  if (l.melee) slots.push({ item: l.melee, qty: 1 });
  (l.utility ?? []).forEach((u) => u.item && slots.push({ item: u.item, qty: u.qty || 1 }));
  k.hotbar = Array.from({ length: HOTBAR }, (_, i) => slots[i] ?? null);
  k.bag = slots.slice(HOTBAR);
  return { ...k, public: !!l.public, vest: l.vest ?? null, plates: l.plates ?? 0, bagType: l.bag ?? null };
}
