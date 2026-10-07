import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, where, writeBatch } from 'firebase/firestore';
import { useDoc } from '../hooks/useCollection';
import { db } from './firebase';
import { PETTY_CRIMES } from './types';
import { COMMON_VEHICLES } from './vehicles';

// ---------- defaults ----------

/** App-wide numbers an admin can change. Anything missing uses the built-in value. */
export interface Defaults {
  /** Gang rep it costs leadership to call in a blacksite. */
  callInCost?: number;
  /** A member's weekly petty rep goal until they set their own. */
  weeklyGoal?: number;
  /** Days the stash keeps daily snapshots. */
  snapDays?: number;
  /** The city clock: an IANA zone, the short label shown next to times, and night hours for the map. */
  zone?: string;
  zoneLabel?: string;
  nightFrom?: number;
  nightTo?: number;
}
export const BUILT_IN = { callInCost: 150, weeklyGoal: 0, snapDays: 90, zone: 'America/New_York', zoneLabel: 'ET', nightFrom: 20, nightTo: 6 };
export const ZONES: [string, string][] = [
  ['America/New_York', 'ET'],
  ['America/Chicago', 'CT'],
  ['America/Denver', 'MT'],
  ['America/Los_Angeles', 'PT'],
  ['Europe/London', 'UK'],
  ['Europe/Berlin', 'CET'],
  ['Australia/Sydney', 'AET'],
  ['UTC', 'UTC'],
];

export function useDefaults() {
  const d = useDoc<Defaults>('settings/defaults');
  return { ...BUILT_IN, ...(d ?? {}) };
}
export const saveDefaults = (patch: Defaults) => setDoc(doc(db, 'settings', 'defaults'), patch, { merge: true });

// ---------- lists ----------

export interface CrimeType {
  id: string;
  name: string;
  /** A lucide icon name from CRIME_ICONS. */
  icon: string;
  /** The usual rep and dirty cash for one job, to prefill the tally. */
  rep?: number;
  cash?: number;
}
export interface VehicleRow {
  name: string;
  cls: string;
  hidden?: boolean;
}
/** Something sold on the Narco call besides the NoelOps drugs: a catalog item taken from the stash. */
export interface Product {
  id: string;
  name: string;
  unit: string;
  itemId: string;
  retired?: boolean;
}
export interface Lists {
  crimes?: CrimeType[];
  vehicles?: VehicleRow[];
  products?: Product[];
}
export const CRIME_ICONS = ['package', 'car', 'flame', 'crosshair', 'star', 'gem', 'banknote', 'lock-open', 'skull', 'zap', 'truck', 'store'] as const;
const DEFAULT_CRIME_ICONS: Record<string, string> = { Delivery: 'package', Vehicle: 'car', Arson: 'flame', Assassination: 'crosshair', Special: 'star' };
export const BUILT_IN_CRIMES: CrimeType[] = PETTY_CRIMES.map((n) => ({ id: n.toLowerCase(), name: n, icon: DEFAULT_CRIME_ICONS[n] ?? 'star' }));

export function useLists() {
  const d = useDoc<Lists>('settings/lists');
  return {
    ready: d !== undefined,
    crimes: d?.crimes?.length ? d.crimes : BUILT_IN_CRIMES,
    vehicles: (d?.vehicles?.length ? d.vehicles : COMMON_VEHICLES.map(([name, cls]) => ({ name, cls }))) as VehicleRow[],
    products: d?.products ?? [],
    raw: d ?? null,
  };
}
export const saveLists = (patch: Lists) => setDoc(doc(db, 'settings', 'lists'), patch, { merge: true });
export const slugId = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30) || `x${Date.now().toString(36)}`;

// ---------- the feed ----------

export type FeedKind = 'join' | 'rank' | 'status' | 'fix' | 'merge' | 'delete' | 'settings' | 'price' | 'list' | 'admin' | 'stash';
export interface FeedEntry {
  id: string;
  kind: FeedKind;
  text: string;
  by: string;
  byName: string;
  target?: string | null;
  reason?: string;
  at?: Timestamp;
}
/** Writes one line to the admin feed. Never blocks the action it describes. */
export const feed = (me: { id: string; name: string }, kind: FeedKind, text: string, extra: { target?: string | null; reason?: string } = {}) =>
  addDoc(collection(db, 'adminFeed'), {
    kind,
    text: text.slice(0, 200),
    by: me.id,
    byName: me.name,
    target: extra.target ?? null,
    reason: (extra.reason ?? '').slice(0, 140),
    at: serverTimestamp(),
  }).catch(() => {});

// ---------- welcomes ----------

export interface Welcome {
  id: string;
  text: string;
  by: string;
  byName: string;
  at?: Timestamp;
}
export const sendWelcome = (me: { id: string; name: string }, to: string, text: string) =>
  setDoc(doc(db, 'welcomes', to), { text: text.trim().slice(0, 300), by: me.id, byName: me.name, at: serverTimestamp() });
export const dismissWelcome = (me: string) => deleteDoc(doc(db, 'welcomes', me));

// ---------- prices ----------

export interface PriceChange {
  id: string;
  product: string;
  price: number;
  was: number;
  by: string;
  byName: string;
  at?: Timestamp;
}
export const logPrice = (me: { id: string; name: string }, product: string, was: number, price: number) =>
  addDoc(collection(db, 'priceLog'), { product, price, was, by: me.id, byName: me.name, at: serverTimestamp() });

// ---------- merge & delete (owners only) ----------

/** Where a member's things live: collection, the field naming them, and (for names) the field to rename. */
const OWNED: { coll: string; field: string; name?: string }[] = [
  { coll: 'sales', field: 'sellerId', name: 'sellerName' },
  { coll: 'myCash', field: 'memberId' },
  { coll: 'trophies', field: 'memberId' },
  { coll: 'pettyLog', field: 'memberId' },
  { coll: 'repTransfers', field: 'memberId' },
  { coll: 'signouts', field: 'memberId', name: 'memberName' },
  { coll: 'builds', field: 'by', name: 'byName' },
  { coll: 'kits', field: 'owner' },
];
const LABEL: Record<string, string> = { sales: 'sales', myCash: 'locker cash entries', trophies: 'trophies', pettyLog: 'petty jobs', repTransfers: 'rep transfers', signouts: 'sign-outs', builds: 'builds', kits: 'kits', lockerStock: 'locker storages' };

/** What a merge or delete would touch, by collection. */
export async function previewMember(id: string) {
  const out: { coll: string; label: string; n: number }[] = [];
  for (const o of OWNED) {
    const snap = await getDocs(query(collection(db, o.coll), where(o.field, '==', id))).catch(() => null);
    if (snap?.size) out.push({ coll: o.coll, label: LABEL[o.coll] ?? o.coll, n: snap.size });
  }
  const lockers = await getDocs(query(collection(db, 'lockerStock'), where('owner', '==', id))).catch(() => null);
  if (lockers?.size) out.push({ coll: 'lockerStock', label: LABEL.lockerStock!, n: lockers.size });
  return out;
}

/** Moves everything of `from` onto `into`, adds up their petty rep and stats, then removes `from`'s member file. */
export async function mergeMembers(from: { id: string; name: string; nameLower?: string }, into: { id: string; name: string }) {
  const writes: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
  for (const o of OWNED) {
    const snap = await getDocs(query(collection(db, o.coll), where(o.field, '==', from.id)));
    snap.forEach((d) => writes.push((b) => b.update(d.ref, { [o.field]: into.id, ...(o.name ? { [o.name]: into.name } : {}) })));
  }
  // Locker storages: copy over if the other account doesn't have that storage yet; otherwise leave it for a hand check.
  const lockers = await getDocs(query(collection(db, 'lockerStock'), where('owner', '==', from.id)));
  const theirs = new Set((await getDocs(query(collection(db, 'lockerStock'), where('owner', '==', into.id)))).docs.map((x) => x.id));
  const skipped: string[] = [];
  for (const d of lockers.docs) {
    const storage = d.id.split('__')[1] ?? '';
    const dest = doc(db, 'lockerStock', `${into.id}__${storage}`);
    if (theirs.has(dest.id)) skipped.push(storage);
    else writes.push((b) => (b.set(dest, { ...d.data(), owner: into.id }), b.delete(d.ref)));
  }
  // Petty rep and work stats add up.
  const sum = async (coll: string, keys: string[]) => {
    const [a, c] = await Promise.all([getDoc(doc(db, coll, from.id)), getDoc(doc(db, coll, into.id))]);
    const fa = a.data();
    if (!fa) return;
    const fc = c.data() ?? {};
    const next: Record<string, number> = {};
    keys.forEach((k) => (next[k] = (Number(fc[k]) || 0) + (Number(fa[k]) || 0)));
    writes.push((b) => (b.set(doc(db, coll, into.id), next, { merge: true }), b.delete(doc(db, coll, from.id))));
  };
  await sum('petty', ['rep']);
  await sum('stats', ['harvests', 'pressed', 'cooks', 'runs']);
  writes.push((b) => b.delete(doc(db, 'members', from.id)));
  if (from.nameLower) writes.push((b) => b.delete(doc(db, 'names', from.nameLower!)));
  writes.push((b) => b.delete(doc(db, 'presence', from.id)));
  for (let i = 0; i < writes.length; i += 400) {
    const b = writeBatch(db);
    writes.slice(i, i + 400).forEach((w) => w(b));
    await b.commit();
  }
  return { moved: writes.length, skipped };
}

/** Wipes a member and everything of theirs (for test accounts). */
export async function deleteMember(m: { id: string; nameLower?: string }) {
  // The member file goes first: if this person can't be deleted (an owner, the top rank), nothing else is touched.
  await deleteDoc(doc(db, 'members', m.id));
  const refs = [];
  for (const o of OWNED) refs.push(...(await getDocs(query(collection(db, o.coll), where(o.field, '==', m.id)))).docs.map((d) => d.ref));
  refs.push(...(await getDocs(query(collection(db, 'lockerStock'), where('owner', '==', m.id)))).docs.map((d) => d.ref));
  for (const c of ['petty', 'stats', 'streaks', 'sheets', 'pettyGoals', 'shopping', 'kitPicks', 'presence', 'welcomes']) refs.push(doc(db, c, m.id));
  if (m.nameLower) refs.push(doc(db, 'names', m.nameLower));
  for (let i = 0; i < refs.length; i += 400) {
    const b = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => b.delete(r));
    await b.commit();
  }
  return refs.length;
}
