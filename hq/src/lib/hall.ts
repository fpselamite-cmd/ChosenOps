import { addDoc, collection, deleteDoc, deleteField, doc, query, serverTimestamp, setDoc, updateDoc, where, type Timestamp } from 'firebase/firestore';
import { useMemo } from 'react';
import { useCollection } from '../hooks/useCollection';
import { mvps, type Blacksite } from './blacksites';
import { monthKey, useBoards } from './boards';
import { db } from './firebase';
import type { Heist } from './heists';
import type { NarcoRun } from './runs';
import { useHub } from '../hooks/useHub';
import type { RepTransfer } from './types';

/** Every Hall of Fame board: month → member → value. */
export type HallBoardId = 'sales' | 'bricks' | 'runs' | 'mvps' | 'heists' | 'rep';
/** Boards about narcotics (drug sales, bricks pressed): Narco and High Table only. */
export const NARCO_BOARDS = new Set<string>(['sales', 'bricks', 'runs']);

export const HALL_BOARDS: { id: HallBoardId; name: string; title: string; unit: (v: number) => string; design: 'moneybag' | 'brick' | 'crosshair' | 'mask' | 'crest' }[] = [
  { id: 'sales', name: 'Top Sellers', title: 'Top Seller', unit: (v) => `$${Math.round(v).toLocaleString('en-US')}`, design: 'moneybag' },
  { id: 'bricks', name: 'Brick Press', title: 'Top Presser', unit: (v) => `${v.toLocaleString('en-US')} ${v === 1 ? 'brick' : 'bricks'}`, design: 'brick' },
  { id: 'runs', name: 'Top Runners', title: 'Top Runner', unit: (v) => `${v} run${v === 1 ? '' : 's'}`, design: 'moneybag' },
  { id: 'mvps', name: 'Blacksite MVPs', title: 'Blacksite MVP', unit: (v) => `${v} MVP${v === 1 ? '' : 's'}`, design: 'crosshair' },
  { id: 'heists', name: 'Top Heisters', title: 'Top Heister', unit: (v) => `${v} heist${v === 1 ? '' : 's'}`, design: 'mask' },
  { id: 'rep', name: 'Petty Rep', title: 'Rep Giver', unit: (v) => `${v.toLocaleString('en-US')} rep`, design: 'crest' },
];
export type Ranked = { memberId: string; value: number; place: number };
export const rankMap = (m?: Record<string, number>): Ranked[] =>
  Object.entries(m ?? {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([memberId, value], i) => ({ memberId, value, place: i + 1 }));

export function useHall() {
  const boards = useBoards();
  const sites = useCollection<Blacksite>('blacksites');
  const reps = useCollection<RepTransfer & { decidedAt?: Timestamp }>('repTransfers');
  const heists = useCollection<Heist>('heists');
  const { narco } = useHub();
  const runs = useCollection<NarcoRun>('narcoRuns', narco);
  return useMemo(() => {
    const data: Record<HallBoardId, Map<string, Record<string, number>>> = { sales: new Map(), bricks: new Map(), runs: new Map(), mvps: new Map(), heists: new Map(), rep: new Map() };
    const add = (b: HallBoardId, ym: string, who: string, v: number) => {
      const m = data[b].get(ym) ?? {};
      m[who] = (m[who] ?? 0) + v;
      data[b].set(ym, m);
    };
    boards.months.forEach((m) => {
      if (m.sales) data.sales.set(m.id, { ...m.sales });
      if (m.bricks) data.bricks.set(m.id, { ...m.bricks });
    });
    (sites ?? []).forEach((s) => mvps(s).ids.forEach((id) => add('mvps', monthKey(s.at), id, 1)));
    // Every finished heist (success or not) counts for each member of the crew.
    (heists ?? []).filter((h) => h.status === 'done').forEach((h) => h.crew.forEach((id) => add('heists', monthKey(h.doneAt ?? h.at ?? Date.now()), id, 1)));
    // Narco runs that went out (not called off) count for each member of the crew.
    (runs ?? []).filter((r) => r.outcome !== 'off').forEach((r) => r.crew.forEach((id) => add('runs', monthKey(r.at ?? Date.now()), id, 1)));
    (reps ?? []).filter((r) => r.status === 'confirmed').forEach((r) => add('rep', monthKey(r.decidedAt ?? r.at ?? Date.now()), r.memberId, r.amount));
    const months = [...new Set(HALL_BOARDS.flatMap((b) => [...data[b.id].keys()]))].sort().reverse();
    const allTime = (b: HallBoardId) => {
      const t: Record<string, number> = {};
      data[b].forEach((m) => Object.entries(m).forEach(([k, v]) => (t[k] = (t[k] ?? 0) + v)));
      return rankMap(t);
    };
    return { ready: boards.ready && !!sites && !!reps, data, months, allTime, at: (b: HallBoardId, ym: string) => rankMap(data[b].get(ym)) };
  }, [boards, sites, reps, heists, runs]);
}

// ---------- MVP of the month ----------
export interface MonthMvp {
  id: string;
  memberId: string;
  why: string;
  by: string;
}
export const setMonthMvp = (ym: string, memberId: string, why: string, by: string) => setDoc(doc(db, 'monthMvp', ym), { memberId, why: why.slice(0, 140), by });

// ---------- Legends ----------
export interface Legend {
  id: string;
  memberId?: string | null;
  name: string;
  title: string;
  text: string;
  by: string;
  at?: Timestamp;
}
export const addLegend = (l: Omit<Legend, 'id' | 'at'>) => addDoc(collection(db, 'legends'), { ...l, at: serverTimestamp() });
export const removeLegend = (id: string) => deleteDoc(doc(db, 'legends', id));

// ---------- Past members ----------
export type PastKind = 'deceased' | 'retired' | 'moved' | 'exiled';
export const PAST_KINDS: { id: PastKind; label: string; hint: string }[] = [
  { id: 'deceased', label: 'Deceased', hint: 'Their character died' },
  { id: 'retired', label: 'Retired', hint: 'Stepped away with honor' },
  { id: 'moved', label: 'Moved on', hint: 'Left the city' },
  { id: 'exiled', label: 'Exiled', hint: 'Burned. Only leadership sees them' },
];
export interface Past {
  id?: string;
  kind: PastKind;
  day: string;
  epitaph: string;
}
/** Leadership: mark someone as a past member. They leave the roster and can't sign in; their record stays. */
export async function markPast(m: { id: string; rankId: string | null }, p: Past) {
  await setDoc(doc(db, 'pastMembers', m.id), { kind: p.kind, day: p.day, epitaph: p.epitaph.slice(0, 200) });
  await updateDoc(doc(db, 'members', m.id), { status: 'suspended', rankId: m.rankId });
}
export async function restoreMember(m: { id: string; rankId: string | null }) {
  await updateDoc(doc(db, 'members', m.id), { status: 'active', rankId: m.rankId });
  await deleteDoc(doc(db, 'pastMembers', m.id));
}

/** Past members I'm allowed to see (exiled ones only for leadership). */
export function usePastMembers(lead: boolean) {
  const all = useMemo(() => query(collection(db, 'pastMembers')), []);
  const honored = useMemo(() => query(collection(db, 'pastMembers'), where('kind', 'in', ['deceased', 'retired', 'moved'])), []);
  const a = useCollection<Past & { id: string }>(all, lead);
  const h = useCollection<Past & { id: string }>(honored, !lead);
  return new Map(((lead ? a : h) ?? []).map((p) => [p.id, p]));
}

// ---------- Tributes ----------
export interface Tribute {
  id: string;
  candles?: Record<string, boolean>;
}
export interface Memory {
  id: string;
  by: string;
  byName: string;
  text: string;
  at?: Timestamp;
}
export const lightCandle = (memberId: string, me: string, on: boolean) =>
  setDoc(doc(db, 'tributes', memberId), { candles: { [me]: on ? true : deleteField() } }, { merge: true });
export const addMemory = (memberId: string, me: { id: string; name: string }, text: string) =>
  addDoc(collection(db, 'tributes', memberId, 'memories'), { by: me.id, byName: me.name, text: text.slice(0, 140), at: serverTimestamp() });
export const removeMemory = (memberId: string, id: string) => deleteDoc(doc(db, 'tributes', memberId, 'memories', id));
