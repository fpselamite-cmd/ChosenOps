import { addDoc, collection, deleteDoc, doc, runTransaction, serverTimestamp, updateDoc, type Timestamp } from 'firebase/firestore';
import type { BudField, RootField, StrainId } from '../noel/data';
import { addEntry } from './books';
import { db } from './firebase';
import { addMyCash, SALE_ITEMS } from './money';

/**
 * Narco Runs: logged after the fact by Narco members (and High Table). Product comes off the stash it
 * was taken from (unless the run was called off), and the cash is handed out like a heist's: cuts to the
 * crew's own money, the rest to the gang bank. Nobody without Narco ever sees any of it.
 */
export type RunOutcome = 'clean' | 'busted' | 'robbed' | 'off';
export const OUTCOMES: { id: RunOutcome; label: string; hint: string; color: string }[] = [
  { id: 'clean', label: 'Clean', hint: 'Sold or delivered, no trouble', color: '#4ade80' },
  { id: 'busted', label: 'Busted', hint: 'Cops took it', color: '#60a5fa' },
  { id: 'robbed', label: 'Robbed', hint: 'Someone took it off us', color: '#f87171' },
  { id: 'off', label: 'Called off', hint: 'Turned back: product stays in the stash', color: '#a8a29e' },
];
export const outcomeOf = (o: RunOutcome) => OUTCOMES.find((x) => x.id === o) ?? OUTCOMES[0]!;

/** What a run can carry: every strain's bricks, coke and meth (as on the BlackMarket), plus coca leaves. */
export const RUN_PRODUCTS: { id: string; name: string; unit: string; strain?: StrainId; field: BudField | RootField }[] = [
  ...SALE_ITEMS.map((s) => ({ id: s.id, name: s.strain ? `${s.name} brick` : s.name, unit: s.unit, strain: s.strain, field: s.field })),
  { id: 'coca', name: 'Coca leaves', unit: 'leaf', field: 'coca' },
];
export const runProduct = (id: string) => RUN_PRODUCTS.find((p) => p.id === id);

export interface RunLine {
  product: string;
  qty: number;
}
/** A stock change the run made, kept so deleting it can put the product back. */
export interface RunTaken {
  loc: string;
  strain?: StrainId;
  field: BudField | RootField;
  delta: number;
}
export interface NarcoRun {
  id: string;
  crew: string[];
  lines: RunLine[];
  /** The stash it came from. */
  from: string;
  taken: RunTaken[];
  cash: number;
  cashGiven?: Record<string, number>;
  cashCollected?: Record<string, number>;
  banked?: boolean;
  postal: string;
  note: string;
  outcome: RunOutcome;
  /** What went wrong, for busted and robbed runs. */
  badNote?: string;
  rivalId?: string | null;
  by: string;
  byName: string;
  at?: Timestamp;
}
export type RunDraft = Pick<NarcoRun, 'crew' | 'lines' | 'from' | 'cash' | 'postal' | 'note' | 'outcome' | 'badNote' | 'rivalId'>;
type Me = { id: string; name: string };

const clip = (d: Partial<RunDraft>) => ({
  ...d,
  ...(d.cash != null && { cash: Math.max(0, Math.round(d.cash)) }),
  ...(d.postal != null && { postal: d.postal.trim().slice(0, 10) }),
  ...(d.note != null && { note: d.note.trim().slice(0, 300) }),
  ...(d.badNote != null && { badNote: d.badNote.trim().slice(0, 200) }),
});

export const logRun = (me: Me, d: RunDraft, taken: RunTaken[]) =>
  addDoc(collection(db, 'narcoRuns'), { ...clip(d), taken, cashGiven: {}, cashCollected: {}, banked: false, by: me.id, byName: me.name, at: serverTimestamp() });
/** Edits fix the record: crew, cash, postal, notes and how it went (never the product or stash). */
export const editRun = (id: string, d: Partial<Pick<RunDraft, 'crew' | 'cash' | 'postal' | 'note' | 'outcome' | 'badNote' | 'rivalId'>>) => updateDoc(doc(db, 'narcoRuns', id), clip(d));
export const removeRun = (id: string) => deleteDoc(doc(db, 'narcoRuns', id));

/** Leadership hands out cash: member → how much more, out of what hasn't been given. */
export function giveRunCash(r: NarcoRun, give: Record<string, number>) {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'narcoRuns', r.id);
    const cur = (await tx.get(ref)).data() as NarcoRun;
    const given = { ...(cur.cashGiven ?? {}) };
    let left = (cur.cash ?? 0) - Object.values(given).reduce((t, v) => t + v, 0);
    Object.entries(give).forEach(([m, n]) => {
      const g = Math.max(0, Math.min(left, Math.round(n)));
      if (!g) return;
      given[m] = (given[m] ?? 0) + g;
      left -= g;
    });
    tx.update(ref, { cashGiven: given });
  });
}
export async function collectRunCash(me: Me, r: NarcoRun) {
  const owed = (r.cashGiven?.[me.id] ?? 0) - (r.cashCollected?.[me.id] ?? 0);
  if (owed <= 0) return 0;
  await addMyCash(me.id, owed, 0, `Narco run${r.postal ? ` · ${r.postal}` : ''}`);
  await updateDoc(doc(db, 'narcoRuns', r.id), { [`cashCollected.${me.id}`]: r.cashGiven![me.id] });
  return owed;
}
export const runLeft = (r: NarcoRun) => (r.cash ?? 0) - Object.values(r.cashGiven ?? {}).reduce((t, v) => t + v, 0);
export async function bankRunRest(me: Me, r: NarcoRun) {
  const rest = runLeft(r);
  if (rest > 0) await addEntry(me, { dir: 'in', cash: 'dirty', amount: rest, category: 'Narco run', note: `Narco run${r.postal ? ` · ${r.postal}` : ''}`.slice(0, 140), memberId: null, source: 'run', ref: r.id });
  await updateDoc(doc(db, 'narcoRuns', r.id), { banked: true });
  return rest;
}

// ---------- stats ----------

export interface RunStats {
  narcoRuns: number;
  runsClean: number;
  runsBusted: number;
  runsRobbed: number;
  /** Biggest single run's cash, of the ones they were on. */
  bestHaul: number;
  /** Cash they were handed from runs. */
  runCash: number;
  /** Units moved on clean runs. */
  unitsMoved: number;
}
export function runStatsOf(all: NarcoRun[], memberId: string): RunStats {
  const mine = all.filter((r) => r.crew.includes(memberId) && r.outcome !== 'off');
  return {
    narcoRuns: mine.length,
    runsClean: mine.filter((r) => r.outcome === 'clean').length,
    runsBusted: mine.filter((r) => r.outcome === 'busted').length,
    runsRobbed: mine.filter((r) => r.outcome === 'robbed').length,
    bestHaul: Math.max(0, ...mine.map((r) => r.cash ?? 0)),
    runCash: mine.reduce((t, r) => t + (r.cashGiven?.[memberId] ?? 0), 0),
    unitsMoved: mine.filter((r) => r.outcome === 'clean').reduce((t, r) => t + r.lines.reduce((s, l) => s + l.qty, 0), 0),
  };
}
