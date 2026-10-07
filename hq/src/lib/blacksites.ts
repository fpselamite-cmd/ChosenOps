import { addDoc, collection, deleteDoc, doc, increment, runTransaction, serverTimestamp, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { Thing } from './locker';

/** What someone brought to the people still on the point. */
export const BROUGHT = [
  { id: 'ammo', label: 'Ammo' },
  { id: 'meds', label: 'Medkits' },
  { id: 'plates', label: 'Plates' },
  { id: 'armor', label: 'Armor' },
  { id: 'repair', label: 'Repair kits' },
] as const;

export const RESULTS = [
  { id: 'win', label: 'Held it', color: '#22c55e' },
  { id: 'draw', label: 'Contested', color: '#d4af37' },
  { id: 'loss', label: 'Lost it', color: '#ef4444' },
] as const;
export type Result = (typeof RESULTS)[number]['id'];

export interface StatLine {
  kills?: number;
  downs?: number;
  /** Supply runs to the point. */
  logistics?: number;
  brought?: string[];
}

export interface Blacksite {
  id: string;
  zone: string;
  pinId?: string | null;
  at: Timestamp;
  result: Result;
  rivals: string[];
  holdMins: number;
  rep: number;
  notes?: string;
  participants: string[];
  stats: Record<string, StatLine>;
  /** voter → who they voted MVP */
  votes: Record<string, string>;
  lootStatus: 'open' | 'closed';
  closesAt?: Timestamp;
  stashTo: string;
  closedBy?: string;
  loggedBy: string;
  loggedByName?: string;
  repStatus: 'pending' | 'confirmed' | 'rejected';
  repBy?: string;
  /** We called it in ourselves, which costs family rep. */
  calledIn?: boolean;
  /** The blacksite location it happened at. */
  spotId?: string | null;
  createdAt?: Timestamp;
}

/** What calling in a blacksite costs the family. */
export const CALL_IN_COST = 150;
/** What a fight does to family rep once confirmed: rep earned, minus the call-in cost. */
export const netRep = (s: Pick<Blacksite, 'rep' | 'calledIn'>) => s.rep - (s.calledIn ? CALL_IN_COST : 0);

/** A blacksite location. They repeat, so each keeps its own record. */
export interface Spot {
  id: string;
  name: string;
  /** Spot on the city map, 0–1 from the left and the top. */
  x?: number | null;
  y?: number | null;
  notes?: string;
  by: string;
  at?: Timestamp;
}
export const addSpot = (me: string, name: string) => addDoc(collection(db, 'blacksiteSpots'), { name: name.trim().slice(0, 60), x: null, y: null, notes: '', by: me, at: serverTimestamp() }).then((r) => r.id);
export const saveSpot = (id: string, patch: Partial<Pick<Spot, 'name' | 'x' | 'y' | 'notes'>>) => updateDoc(doc(db, 'blacksiteSpots', id), patch);
/** Folds one location into another: its fights move over, then it's gone. */
export async function mergeSpots(from: Spot, into: Spot, fights: Blacksite[]) {
  const b = writeBatch(db);
  fights.forEach((f) => b.update(doc(db, 'blacksites', f.id), { spotId: into.id, zone: into.name }));
  b.delete(doc(db, 'blacksiteSpots', from.id));
  await b.commit();
}
export const removeSpot = (id: string) => deleteDoc(doc(db, 'blacksiteSpots', id));
/** Which location a fight was at: its spotId, or (older fights) a location with the same name. */
export const spotOf = (f: Pick<Blacksite, 'spotId' | 'zone'>, spots: Spot[]) =>
  spots.find((x) => x.id === f.spotId) ?? spots.find((x) => x.name.trim().toLowerCase() === f.zone.trim().toLowerCase());

export interface Loot {
  id: string;
  label: string;
  item?: string;
  strain?: string;
  field: string;
  /** Still in the pile. */
  qty: number;
  claims: Record<string, number>;
  /** Leadership's split: member → how many. */
  assigned?: Record<string, number>;
  /** How many each member has put in their locker. */
  collected?: Record<string, number>;
  dumped?: boolean;
}

export interface Photo {
  id: string;
  image: string;
  by: string;
  at?: Timestamp;
}

export type SiteDraft = Pick<Blacksite, 'zone' | 'pinId' | 'spotId' | 'calledIn' | 'result' | 'rivals' | 'holdMins' | 'rep' | 'notes' | 'participants' | 'stashTo'> & { at: Date };

/** The MVP(s): most votes from the people who were there. */
export function mvps(s: Blacksite) {
  const n: Record<string, number> = {};
  Object.values(s.votes ?? {}).forEach((v) => (n[v] = (n[v] ?? 0) + 1));
  const top = Math.max(0, ...Object.values(n));
  return { ids: top ? Object.keys(n).filter((k) => n[k] === top) : [], votes: n, top };
}

export async function logFight(me: { id: string; name: string }, d: SiteDraft, loot: Thing[]) {
  const ref = await addDoc(collection(db, 'blacksites'), {
    zone: d.zone.trim().slice(0, 60),
    pinId: d.pinId ?? null,
    spotId: d.spotId ?? null,
    calledIn: !!d.calledIn,
    at: Timestamp.fromDate(d.at),
    result: d.result,
    rivals: d.rivals.slice(0, 10),
    holdMins: d.holdMins,
    rep: d.rep,
    notes: (d.notes ?? '').slice(0, 1000),
    participants: d.participants,
    stats: {},
    votes: {},
    lootStatus: loot.length ? 'open' : 'closed',
    stashTo: d.stashTo,
    loggedBy: me.id,
    loggedByName: me.name,
    repStatus: 'pending',
    createdAt: serverTimestamp(),
  });
  await Promise.all(
    loot.map((t) =>
      addDoc(collection(db, 'blacksites', ref.id, 'loot'), { label: t.label.slice(0, 60), item: t.item ?? null, strain: t.strain ?? null, field: t.field, qty: t.qty, claims: {}, assigned: {}, collected: {} }),
    ),
  );
  return ref.id;
}

export const saveSite = (id: string, patch: Partial<Omit<Blacksite, 'at'>> & { at?: Date }) =>
  updateDoc(doc(db, 'blacksites', id), { ...patch, ...(patch.at ? { at: Timestamp.fromDate(patch.at) } : {}) });
export const saveLine = (id: string, me: string, line: StatLine) => updateDoc(doc(db, 'blacksites', id), { [`stats.${me}`]: line });
export const vote = (id: string, me: string, forId: string) => updateDoc(doc(db, 'blacksites', id), { [`votes.${me}`]: forId });
export const removeSite = (id: string) => deleteDoc(doc(db, 'blacksites', id));
export const addPhoto = (id: string, me: string, image: string) => addDoc(collection(db, 'blacksites', id, 'photos'), { image, by: me, at: serverTimestamp() });
export const removePhoto = (id: string, pid: string) => deleteDoc(doc(db, 'blacksites', id, 'photos', pid));

/** Confirming puts the fight's rep on the family total in the same write. */
export async function decideRep(s: Blacksite, me: string, ok: boolean) {
  const b = writeBatch(db);
  b.update(doc(db, 'blacksites', s.id), { repStatus: ok ? 'confirmed' : 'rejected', repBy: me });
  if (ok) b.set(doc(db, 'stats', 'familyRep'), { total: increment(netRep(s)), lastBlacksite: s.id }, { merge: true });
  await b.commit();
}

/** Takes `n` of a loot pile for myself. Returns how many I got. */
export function claimLoot(siteId: string, lootId: string, me: string, n: number) {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'blacksites', siteId, 'loot', lootId);
    const cur = (await tx.get(ref)).data() as Loot | undefined;
    const got = Math.min(n, cur?.qty ?? 0);
    if (got > 0) tx.update(ref, { qty: cur!.qty - got, [`claims.${me}`]: (cur!.claims?.[me] ?? 0) + got });
    return got;
  });
}
/** Puts back what I claimed (only while the draw is open). */
export function unclaimLoot(siteId: string, lootId: string, me: string, n: number) {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'blacksites', siteId, 'loot', lootId);
    const cur = (await tx.get(ref)).data() as Loot;
    const back = Math.min(n, cur.claims?.[me] ?? 0);
    if (back > 0) tx.update(ref, { qty: cur.qty + back, [`claims.${me}`]: (cur.claims[me] ?? 0) - back });
    return back;
  });
}

/** Leadership hands out loot: member → how many more, out of what's left in the pile. */
export function assignLoot(siteId: string, lootId: string, give: Record<string, number>) {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'blacksites', siteId, 'loot', lootId);
    const cur = (await tx.get(ref)).data() as Loot;
    let left = cur.qty;
    const assigned = { ...(cur.assigned ?? {}) };
    Object.entries(give).forEach(([m, n]) => {
      const g = Math.max(0, Math.min(left, Math.round(n)));
      if (!g) return;
      assigned[m] = (assigned[m] ?? 0) + g;
      left -= g;
    });
    tx.update(ref, { qty: left, assigned });
    return cur.qty - left;
  });
}
/** A fighter marks what they were given as put in their locker. */
export const markCollected = (siteId: string, lootId: string, me: string, n: number) => updateDoc(doc(db, 'blacksites', siteId, 'loot', lootId), { [`collected.${me}`]: n });

export const closeDraw = (id: string, me: string) => updateDoc(doc(db, 'blacksites', id), { lootStatus: 'closed', closedBy: me });
export const markDumped = (siteId: string, lootId: string) => updateDoc(doc(db, 'blacksites', siteId, 'loot', lootId), { qty: 0, dumped: true });

/** Totals per person across fights. */
export interface Record_ {
  id: string;
  fights: number;
  wins: number;
  kills: number;
  downs: number;
  logistics: number;
  mvps: number;
}
export function records(sites: Blacksite[]) {
  const r = new Map<string, Record_>();
  const get = (id: string) => {
    if (!r.has(id)) r.set(id, { id, fights: 0, wins: 0, kills: 0, downs: 0, logistics: 0, mvps: 0 });
    return r.get(id)!;
  };
  sites.forEach((s) => {
    const m = new Set(mvps(s).ids);
    s.participants.forEach((p) => {
      const x = get(p);
      const l = s.stats?.[p] ?? {};
      x.fights++;
      if (s.result === 'win') x.wins++;
      x.kills += l.kills ?? 0;
      x.downs += l.downs ?? 0;
      x.logistics += l.logistics ?? 0;
      if (m.has(p)) x.mvps++;
    });
  });
  return r;
}
