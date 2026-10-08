import { addDoc, collection, deleteDoc, deleteField, doc, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { addEntry } from './books';
import { db } from './firebase';
import { addMyCash } from './money';

/**
 * Heists: leadership plans one, soldiers and up ask to join (with the role they'd take), the planner
 * picks the crew (the rest stay as backups), takes it live (the heist radio lights up), and logs how
 * it went. Cash and items it brings home are handed out like Blacksite loot: cash to the crew's own
 * money, the rest to the gang bank; items to their lockers, leftovers to a stash. Associates never
 * see any of it.
 */
export type HeistStatus = 'planned' | 'live' | 'done' | 'cancelled';
export const HEIST_ROLES = ['Driver', 'Gunman', 'Hacker', 'Driller', 'Lookout', 'Any'] as const;
export type HeistRole = (typeof HEIST_ROLES)[number];
export interface HeistRequest {
  role: HeistRole;
  note: string;
  at: number;
}
export interface Heist {
  id: string;
  name: string;
  /** What's being hit: Fleeca, Paleto, a jewelry store… */
  target: string;
  when: Timestamp | null;
  notes: string;
  /** Asked to join: member → the role they'd take and a note. Anyone not on the crew is a backup. */
  requests: Record<string, HeistRequest>;
  /** The crew the planner picked, and the role each one has. */
  crew: string[];
  roles: Record<string, HeistRole>;
  /** How many they want (0 = no cap). */
  size: number;
  status: HeistStatus;
  outcome?: 'success' | 'failed' | null;
  /** Dirty cash brought home. */
  take?: number;
  /** Leadership's split of the cash: member → how much. */
  cashGiven?: Record<string, number>;
  /** What each member has put in their own money. */
  cashCollected?: Record<string, number>;
  /** The undistributed rest went to the gang bank. */
  banked?: boolean;
  report?: string;
  /** Where leftover items go. */
  stashTo?: string;
  by: string;
  byName: string;
  at?: Timestamp;
  liveAt?: Timestamp | null;
  doneAt?: Timestamp | null;
}
/** Items it brought home (heists/{id}/loot), handed out like Blacksite loot. */
export interface HeistLoot {
  id: string;
  label: string;
  item: string;
  qty: number;
  assigned?: Record<string, number>;
  collected?: Record<string, number>;
  dumped?: boolean;
}
export const TARGETS = ['Fleeca bank', 'Paleto bank', 'Pacific Standard', 'Jewelry store', 'Humane Labs', 'Yacht', 'Other'];

type Me = { id: string; name: string };
export type HeistDraft = Pick<Heist, 'name' | 'target' | 'notes' | 'size'> & { when: Date | null };
const clip = (d: HeistDraft) => ({
  name: d.name.trim().slice(0, 60),
  target: d.target.trim().slice(0, 40),
  notes: d.notes.trim().slice(0, 1000),
  size: Math.max(0, Math.min(30, Math.round(d.size))),
  when: d.when ? Timestamp.fromDate(d.when) : null,
});

export const planHeist = (me: Me, d: HeistDraft) =>
  addDoc(collection(db, 'heists'), {
    ...clip(d),
    requests: {},
    crew: [],
    roles: {},
    status: 'planned',
    outcome: null,
    take: 0,
    cashGiven: {},
    cashCollected: {},
    banked: false,
    report: '',
    by: me.id,
    byName: me.name,
    at: serverTimestamp(),
    liveAt: null,
    doneAt: null,
  });
export const editHeist = (id: string, d: HeistDraft) => updateDoc(doc(db, 'heists', id), clip(d));
export const removeHeist = (id: string) => deleteDoc(doc(db, 'heists', id));

/** Ask to join (or change what I asked for). */
export const requestJoin = (id: string, me: string, role: HeistRole, note: string) =>
  updateDoc(doc(db, 'heists', id), { [`requests.${me}`]: { role, note: note.trim().slice(0, 120), at: Date.now() } });
/** Take my request back. Leadership also takes me off the crew if I was on it. */
export const withdraw = (id: string, me: string) => updateDoc(doc(db, 'heists', id), { [`requests.${me}`]: deleteField() });

/** The planner sets the crew and their roles. */
export const setCrew = (id: string, crew: string[], roles: Record<string, HeistRole>) => updateDoc(doc(db, 'heists', id), { crew, roles });

/** The heist radio follows the heist (quietly does nothing until the channel has been set up). */
const radio = (me: Me, active: boolean) =>
  setDoc(doc(db, 'radio', 'heist'), { active, byName: me.name, at: serverTimestamp() }, { merge: true }).catch(() => {});

/** Going live (or standing down) flips the heist radio in the header to match. */
export async function setLive(me: Me, h: Heist, live: boolean) {
  await updateDoc(doc(db, 'heists', h.id), { status: live ? 'live' : 'planned', liveAt: live ? serverTimestamp() : null });
  await radio(me, live);
}

/** How it went: the outcome, the cash take and the items. The heist radio goes quiet. */
export async function finishHeist(me: Me, h: Heist, r: { outcome: 'success' | 'failed'; take: number; report: string; stashTo: string; items: { item: string; label: string; qty: number }[] } | 'cancel') {
  if (r === 'cancel') {
    await updateDoc(doc(db, 'heists', h.id), { status: 'cancelled', doneAt: serverTimestamp() });
  } else {
    const b = writeBatch(db);
    b.update(doc(db, 'heists', h.id), { status: 'done', outcome: r.outcome, take: Math.max(0, Math.round(r.take)), report: r.report.trim().slice(0, 1000), stashTo: r.stashTo, doneAt: serverTimestamp() });
    r.items.filter((i) => i.qty > 0).forEach((i) => b.set(doc(collection(db, 'heists', h.id, 'loot')), { item: i.item, label: i.label.slice(0, 60), qty: Math.round(i.qty), assigned: {}, collected: {} }));
    await b.commit();
  }
  if (h.status === 'live') await radio(me, false);
}

/** Leadership hands out cash: member → how much more, out of what hasn't been given. */
export function giveCash(h: Heist, give: Record<string, number>) {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'heists', h.id);
    const cur = (await tx.get(ref)).data() as Heist;
    const given = { ...(cur.cashGiven ?? {}) };
    let left = (cur.take ?? 0) - Object.values(given).reduce((t, v) => t + v, 0);
    Object.entries(give).forEach(([m, n]) => {
      const g = Math.max(0, Math.min(left, Math.round(n)));
      if (!g) return;
      given[m] = (given[m] ?? 0) + g;
      left -= g;
    });
    tx.update(ref, { cashGiven: given });
  });
}
/** A crew member puts their cut in their own money (dirty). */
export async function collectCash(me: Me, h: Heist) {
  const owed = (h.cashGiven?.[me.id] ?? 0) - (h.cashCollected?.[me.id] ?? 0);
  if (owed <= 0) return 0;
  await addMyCash(me.id, owed, 0, `Heist: ${h.name}`);
  await updateDoc(doc(db, 'heists', h.id), { [`cashCollected.${me.id}`]: h.cashGiven![me.id] });
  return owed;
}
/** What's left of the take goes to the gang bank (once). */
export async function bankRest(me: Me, h: Heist) {
  const rest = (h.take ?? 0) - Object.values(h.cashGiven ?? {}).reduce((t, v) => t + v, 0);
  if (rest > 0) await addEntry(me, { dir: 'in', cash: 'dirty', amount: rest, category: 'Heist', note: `Heist: ${h.name}`.slice(0, 140), memberId: null, source: 'heist', ref: h.id });
  await updateDoc(doc(db, 'heists', h.id), { banked: true });
  return rest;
}

/** Item loot, like a Blacksite's: leadership splits, members collect, leftovers go into a stash. */
export function assignItems(heistId: string, lootId: string, give: Record<string, number>) {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'heists', heistId, 'loot', lootId);
    const cur = (await tx.get(ref)).data() as HeistLoot;
    let left = cur.qty;
    const assigned = { ...(cur.assigned ?? {}) };
    Object.entries(give).forEach(([m, n]) => {
      const g = Math.max(0, Math.min(left, Math.round(n)));
      if (!g) return;
      assigned[m] = (assigned[m] ?? 0) + g;
      left -= g;
    });
    tx.update(ref, { qty: left, assigned });
  });
}
export const markItemsCollected = (heistId: string, lootId: string, me: string, n: number) => updateDoc(doc(db, 'heists', heistId, 'loot', lootId), { [`collected.${me}`]: n });
export const markItemsDumped = (heistId: string, lootId: string) => updateDoc(doc(db, 'heists', heistId, 'loot', lootId), { qty: 0, dumped: true });

// ---------- stats ----------

export interface HeistStats {
  heists: number;
  heistWins: number;
  heistFails: number;
  /** Biggest single take of a heist they were on. */
  bestTake: number;
  /** Cash they were handed from heists. */
  heistCash: number;
  /** Best run of successes in a row. */
  heistStreak: number;
  asDriver: number;
  asHacker: number;
  asGunman: number;
}
/** One member's record across finished heists. */
export function heistStatsOf(all: Heist[], memberId: string): HeistStats {
  const mine = all.filter((h) => h.status === 'done' && h.crew.includes(memberId)).sort((a, b) => (a.doneAt?.toMillis() ?? 0) - (b.doneAt?.toMillis() ?? 0));
  let run = 0;
  let best = 0;
  mine.forEach((h) => {
    run = h.outcome === 'success' ? run + 1 : 0;
    best = Math.max(best, run);
  });
  const role = (r: HeistRole) => mine.filter((h) => h.roles?.[memberId] === r).length;
  return {
    heists: mine.length,
    heistWins: mine.filter((h) => h.outcome === 'success').length,
    heistFails: mine.filter((h) => h.outcome === 'failed').length,
    bestTake: Math.max(0, ...mine.map((h) => h.take ?? 0)),
    heistCash: mine.reduce((t, h) => t + (h.cashGiven?.[memberId] ?? 0), 0),
    heistStreak: best,
    asDriver: role('Driver'),
    asHacker: role('Hacker'),
    asGunman: role('Gunman'),
  };
}
