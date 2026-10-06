import {
  addDoc,
  collection,
  deleteField,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useMemo } from 'react';
import { useHub } from '../hooks/useHub';
import { db } from '../lib/firebase';
import type { PageId } from '../lib/types';
import {
  BRICK_SIZE,
  BUD_FIELDS,
  MAIN_STASH,
  METH_SIZES,
  ROOT_FIELDS,
  STRAINS,
  STRAIN_BY_ID,
  YIELD_SAMPLES_KEEP,
  budCell,
  cokeLeavesFor,
  dayKey,
  minsLabel,
  n,
  toCount,
  type BudField,
  type Cook,
  type CokeRecipe,
  type OpsLocation,
  type RootField,
  type Run,
  type StockDoc,
  type StrainId,
  type SupplyKey,
  type YieldSample,
} from './data';

/** The live feed is vague on purpose: who did what kind of thing, never amounts, strains or postals. */
export const ACTIVITY_KINDS = {
  buds: { pre: 'updated', hi: 'bud counts', post: 'in a location' },
  coca: { pre: 'updated', hi: 'coke counts', post: 'in a location' },
  meth: { pre: 'updated', hi: 'meth counts', post: 'in a location' },
  items: { pre: 'updated', hi: 'the armory', post: 'in a location' },
  cook: { pre: 'put', hi: 'a meth cook', post: 'down' },
  supply: { pre: 'updated', hi: 'the lab supplies', post: '' },
  run: { pre: 'started', hi: 'a coke run', post: '' },
  runReady: { pre: '', hi: 'A coke run', post: 'should be done' },
  cookReady: { pre: '', hi: 'A meth cook', post: 'is ready to collect' },
  cookDone: { pre: 'collected', hi: 'a meth cook', post: '' },
  move: { pre: 'moved', hi: 'stock', post: 'between locations' },
  harvest: { pre: 'harvested', hi: 'a location', post: '' },
  ready: { pre: '', hi: 'A grow', post: 'is ready to harvest' },
  timer: { pre: 'updated', hi: 'a grow timer', post: '' },
  plan: { pre: 'updated', hi: 'a grow plan', post: '' },
  locations: { pre: 'updated', hi: 'the ops locations', post: '' },
} as const;
export type ActivityKind = keyof typeof ACTIVITY_KINDS;

export type Undo = () => Promise<unknown>;
/** What an action hands back so the page can offer Undo. */
export interface Done {
  text: string;
  undo?: Undo;
  /** Repeat presses with the same key merge into one Undo. */
  key?: string;
}

const stockRef = (loc: string) => doc(db, 'stock', loc);

/** Actions for the Narcotics and Stash pages, signed with who did it and what opened the page. */
export function useOps(page: PageId = 'narcotics') {
  const { me, viaFor } = useHub();
  const via = viaFor(page);

  return useMemo(() => {
    const sign = { _by: me.id, _via: via };

    const log = (kind: ActivityKind, who = me.name) =>
      addDoc(collection(db, 'activity'), { who, kind, ...ACTIVITY_KINDS[kind], at: serverTimestamp(), ...sign }).catch(() => {});

    const made = (field: 'bricksMade' | 'cokeMade' | 'methMade', k: number) =>
      k ? setDoc(doc(db, 'history', dayKey(0)), { [field]: increment(k), ...sign }, { merge: true }).catch(() => {}) : Promise.resolve();

    /**
     * Applies stock changes in one transaction, never letting a count go below zero.
     * Returns the changes actually made, so Undo can reverse exactly those.
     */
    type Delta = { loc: string; strain?: StrainId; field: BudField | RootField; delta: number; item?: string };
    async function applyDeltas(deltas: Delta[]): Promise<Delta[]> {
      const locs = [...new Set(deltas.map((d) => d.loc))];
      return runTransaction(db, async (tx) => {
        const snaps = new Map<string, StockDoc>();
        for (const l of locs) {
          const s = await tx.get(stockRef(l));
          snaps.set(l, (s.exists() ? { id: l, ...s.data() } : { id: l }) as StockDoc);
        }
        const applied: Delta[] = [];
        const writes = new Map<string, Record<string, unknown>>();
        for (const d of deltas) {
          const cur = snaps.get(d.loc)!;
          let have: number;
          if (d.item) have = toCount(cur.items?.[d.item]);
          else if (d.strain) have = budCell(cur, d.strain)[d.field as BudField];
          else have = toCount(cur[d.field]);
          const delta = Math.max(-have, d.delta);
          if (!delta) continue;
          const next = have + delta;
          // keep the snapshot current for later deltas on the same cell
          if (d.item) cur.items = { ...(cur.items ?? {}), [d.item]: next };
          else if (d.strain) cur[d.strain] = { ...budCell(cur, d.strain), [d.field]: next };
          else cur[d.field] = next;
          const w = writes.get(d.loc) ?? {};
          if (d.item) w.items = { ...((w.items as object) ?? {}), [d.item]: next };
          else if (d.strain) w[d.strain] = { ...((w[d.strain] as object) ?? {}), [d.field]: next };
          else w[d.field] = next;
          writes.set(d.loc, w);
          applied.push({ ...d, delta });
        }
        for (const [l, w] of writes) tx.set(stockRef(l), { ...w, ...sign }, { merge: true });
        return applied;
      });
    }
    const reverse = (applied: Delta[]) => () => applyDeltas(applied.map((d) => ({ ...d, delta: -d.delta })));

    const strainName = (id: string) => STRAIN_BY_ID[id as StrainId]?.name ?? ROOT_FIELDS[id as RootField] ?? id;

    return {
      via,
      log,

      // ---------- stock ----------
      async adjust(loc: string, strain: StrainId | null, field: BudField | RootField, delta: number, label: string): Promise<Done | null> {
        const applied = await applyDeltas([{ loc, strain: strain ?? undefined, field, delta }]);
        if (!applied.length) return null;
        log(strain ? 'buds' : field === 'meth' ? 'meth' : 'coca');
        const d = applied[0]!.delta;
        return {
          key: `adj|${loc}|${strain}|${field}`,
          text: `${strain ? `${strainName(strain)} ${field}` : ROOT_FIELDS[field as RootField]} ${d > 0 ? '+' : '−'}${n(Math.abs(d))} · ${label}`,
          undo: reverse(applied),
        };
      },

      async setCount(loc: string, strain: StrainId | null, field: BudField | RootField, value: number, current: number, label: string) {
        return this.adjust(loc, strain, field, toCount(value) - current, label);
      },

      async trim(loc: string, strain: StrainId, amount: number, label: string): Promise<Done | null> {
        const applied = await applyDeltas([
          { loc, strain, field: 'untrimmed', delta: -amount },
          { loc, strain, field: 'trimmed', delta: amount },
        ]);
        if (applied.length < 2) return null;
        log('buds');
        return { key: `trim|${loc}|${strain}`, text: `Trimmed ${n(amount)} ${strainName(strain)} · ${label}`, undo: reverse(applied) };
      },

      async press(loc: string, strain: StrainId, bricks: number, label: string): Promise<Done | null> {
        if (bricks < 1) return null;
        const applied = await applyDeltas([
          { loc, strain, field: 'trimmed', delta: -bricks * BRICK_SIZE },
          { loc, strain, field: 'bricks', delta: bricks },
        ]);
        if (applied.length < 2) return null;
        made('bricksMade', bricks);
        log('buds');
        return {
          text: `Pressed ${bricks} ${strainName(strain)} ${bricks === 1 ? 'brick' : 'bricks'} · ${label}`,
          undo: () => Promise.all([reverse(applied)(), made('bricksMade', -bricks)]),
        };
      },

      async pressCoke(loc: string, size: 'small' | 'large', recipe: CokeRecipe, label: string): Promise<Done | null> {
        const field = size === 'small' ? 'cokeSmall' : 'cokeLarge';
        const applied = await applyDeltas([
          { loc, field: 'coca', delta: -cokeLeavesFor(recipe, size) },
          { loc, field, delta: 1 },
        ]);
        if (applied.length < 2) return null;
        made('cokeMade', 1);
        log('coca');
        return {
          text: `Pressed a ${size} coke brick · ${label}`,
          undo: () => Promise.all([reverse(applied)(), made('cokeMade', -1)]),
        };
      },

      async addBins(loc: string, bins: number, label: string): Promise<Done | null> {
        const applied = await applyDeltas([{ loc, field: 'meth', delta: bins }]);
        if (!applied.length) return null;
        made('methMade', bins);
        log('meth');
        return {
          text: `${bins} meth ${bins === 1 ? 'bin' : 'bins'} added to ${label}`,
          undo: () => Promise.all([reverse(applied)(), made('methMade', -bins)]),
        };
      },

      /** Moves amounts from one place to another. */
      async move(from: string, to: string, what: { strain?: StrainId; field: BudField | RootField; amount: number }[], fromLabel: string, toLabel: string): Promise<Done | null> {
        const deltas: Delta[] = [];
        for (const w of what) {
          deltas.push({ loc: from, strain: w.strain, field: w.field, delta: -w.amount }, { loc: to, strain: w.strain, field: w.field, delta: w.amount });
        }
        // Take first, then only add what was actually taken.
        const taken = await applyDeltas(deltas.filter((d) => d.loc === from));
        if (!taken.length) return null;
        const added = await applyDeltas(taken.map((d) => ({ ...d, loc: to, delta: -d.delta })));
        log('move');
        return {
          text: `Moved ${taken.length === 1 ? `${n(-taken[0]!.delta)} ${taken[0]!.strain ? `${strainName(taken[0]!.strain)} ${taken[0]!.field}` : ROOT_FIELDS[taken[0]!.field as RootField]}` : 'stock'} from ${fromLabel} to ${toLabel}`,
          undo: () => Promise.all([reverse(added)(), reverse(taken)()]),
        };
      },

      async moveAll(from: string, to: string, stock: StockDoc | undefined, fromLabel: string, toLabel: string) {
        const what: { strain?: StrainId; field: BudField | RootField; amount: number }[] = [];
        (Object.keys(ROOT_FIELDS) as RootField[]).forEach((f) => {
          const v = toCount(stock?.[f]);
          if (v) what.push({ field: f, amount: v });
        });
        STRAINS.forEach((s) =>
          BUD_FIELDS.forEach((f) => {
            const v = budCell(stock, s.id)[f];
            if (v) what.push({ strain: s.id, field: f, amount: v });
          }),
        );
        return what.length ? this.move(from, to, what, fromLabel, toLabel) : null;
      },

      async adjustItem(loc: string, item: string, delta: number, label: string): Promise<Done | null> {
        const applied = await applyDeltas([{ loc, field: 'meth', item, delta }]);
        if (!applied.length) return null;
        log('items');
        return { key: `item|${loc}|${item}`, text: `${label} ${applied[0]!.delta > 0 ? '+' : '−'}${Math.abs(applied[0]!.delta)}`, undo: reverse(applied) };
      },

      async setExcluded(loc: OpsLocation, excluded: boolean): Promise<Done> {
        await updateDoc(doc(db, 'locations', loc.id), { excludeTotals: excluded, ...sign });
        log('locations');
        return {
          text: excluded ? `${loc.name} is left out of totals.` : `${loc.name} counts in totals again.`,
          undo: () => updateDoc(doc(db, 'locations', loc.id), { excludeTotals: !excluded, ...sign }),
        };
      },

      // ---------- grow timers ----------
      async setTimers(locs: OpsLocation[], running: boolean): Promise<Done | null> {
        if (!locs.length) return null;
        const batch = writeBatch(db);
        locs.forEach((l) => batch.update(doc(db, 'locations', l.id), { startTime: running ? serverTimestamp() : null, alertSent: false, ...sign }));
        await batch.commit();
        log('timer');
        const ids = locs.map((l) => l.postal ?? l.name).join(', ');
        return {
          text: running ? `Started ${locs.length === 1 ? `the timer for ${ids}` : `${locs.length} timers: ${ids}`}` : `Stopped ${ids}`,
          undo: () => {
            const b = writeBatch(db);
            locs.forEach((l) => b.update(doc(db, 'locations', l.id), { startTime: l.startTime ?? null, alertSent: false, ...sign }));
            return b.commit();
          },
        };
      },

      /** Adds what was collected (untrimmed, per strain) to the stock and starts a new cycle. */
      async harvest(loc: OpsLocation, amounts: Partial<Record<StrainId, number>>, dest: string, destLabel: string, learned: Partial<Record<StrainId, number>>, yields: Record<string, YieldSample[]>): Promise<Done> {
        const deltas: Delta[] = Object.entries(amounts)
          .filter(([, v]) => v! > 0)
          .map(([strain, v]) => ({ loc: dest, strain: strain as StrainId, field: 'untrimmed' as const, delta: v! }));
        const applied = deltas.length ? await applyDeltas(deltas) : [];
        await updateDoc(doc(db, 'locations', loc.id), { startTime: serverTimestamp(), alertSent: false, ...sign });
        // Learn real yields from numbers someone actually typed in.
        const prevYields: Record<string, YieldSample[]> = {};
        for (const [strain, buds] of Object.entries(learned)) {
          const pots = toCount(loc.strainPots?.[strain as StrainId]);
          if (!pots || !buds || buds / pots < 20 || buds / pots > 2000) continue;
          prevYields[strain] = yields[strain] ?? [];
          const samples = [{ buds, pots, at: Date.now() }, ...prevYields[strain]!].slice(0, YIELD_SAMPLES_KEEP);
          await setDoc(doc(db, 'yields', strain), { samples, ...sign });
        }
        const total = applied.reduce((s, d) => s + d.delta, 0);
        log('harvest');
        const postal = loc.postal ?? loc.name;
        return {
          text: total
            ? `Added ${n(total)} untrimmed from Postal ${postal} to ${destLabel}. New cycle started.`
            : `Postal ${postal} restarted. New cycle started.`,
          undo: () =>
            Promise.all([
              reverse(applied)(),
              updateDoc(doc(db, 'locations', loc.id), { startTime: loc.startTime ?? null, ...sign }),
              ...Object.entries(prevYields).map(([s, samples]) => setDoc(doc(db, 'yields', s), { samples, ...sign })),
            ]),
        };
      },

      async resetYields() {
        const b = writeBatch(db);
        STRAINS.forEach((s) => b.set(doc(db, 'yields', s.id), { samples: [], ...sign }));
        await b.commit();
      },

      // ---------- pot plans ----------
      async setPlan(loc: OpsLocation, plan: Partial<Record<StrainId, number>>, text: string): Promise<Done> {
        const before = { ...(loc.strainPots ?? {}) };
        await updateDoc(doc(db, 'locations', loc.id), { strainPots: plan, ...sign });
        log('plan');
        return { key: `plan|${loc.id}`, text, undo: () => updateDoc(doc(db, 'locations', loc.id), { strainPots: before, ...sign }) };
      },
      async setPots(loc: OpsLocation, pots: number) {
        await updateDoc(doc(db, 'locations', loc.id), { pots: Math.max(1, Math.min(200, Math.round(pots))), ...sign });
        log('plan');
      },

      // ---------- lab supplies ----------
      async adjustSupply(key: SupplyKey, delta: number, have: number, label: string): Promise<Done | null> {
        const d = Math.max(-have, delta);
        if (!d) return null;
        await setDoc(doc(db, 'supplies', 'lab'), { [key]: increment(d), ...sign }, { merge: true });
        log('supply');
        return {
          key: `sup|${key}`,
          text: `${label} ${d > 0 ? '+' : '−'}${Math.abs(d)}`,
          undo: () => setDoc(doc(db, 'supplies', 'lab'), { [key]: increment(-d), ...sign }, { merge: true }),
        };
      },
      setSupplyLow: (key: SupplyKey, v: number | null) =>
        setDoc(doc(db, 'settings', 'narcotics'), { supplyLow: { [key]: v ?? deleteField() }, ...sign }, { merge: true }),
      saveRecipe: (recipe: CokeRecipe) => setDoc(doc(db, 'settings', 'narcotics'), { cokeRecipe: recipe, ...sign }, { merge: true }),

      // ---------- meth cooks ----------
      async addCooks(size: number, count: number, mins: number, supplies: Partial<Record<SupplyKey, number>>): Promise<Done> {
        const batch = writeBatch(db);
        const refs = Array.from({ length: count }, () => doc(collection(db, 'cooks')));
        refs.forEach((r) => batch.set(r, { by: me.name, size, mins, at: serverTimestamp(), done: false, told: false, ...sign }));
        // Putting a cook down takes its sodium and ammonia from the lab.
        const took: Partial<Record<SupplyKey, number>> = {};
        (['sodium', 'ammonia'] as const).forEach((k) => {
          const t = Math.min(toCount(supplies[k]), size * count);
          if (t) took[k] = t;
        });
        if (Object.keys(took).length)
          batch.set(doc(db, 'supplies', 'lab'), { ...Object.fromEntries(Object.entries(took).map(([k, v]) => [k, increment(-v)])), ...sign }, { merge: true });
        await batch.commit();
        log('cook');
        const what = count > 1 ? `${count} ${METH_SIZES[size]!.toLowerCase()} yields` : `${METH_SIZES[size]} yield`;
        const tookText = Object.keys(took).length ? ` Took ${Object.entries(took).map(([k, v]) => `${v} ${k}`).join(' + ')} from the lab.` : '';
        return {
          text: `Put down ${what}. Ready in ${minsLabel(mins)}.${tookText}`,
          undo: () => {
            const b = writeBatch(db);
            refs.forEach((r) => b.update(r, { done: true, ...sign }));
            if (Object.keys(took).length)
              b.set(doc(db, 'supplies', 'lab'), { ...Object.fromEntries(Object.entries(took).map(([k, v]) => [k, increment(v)])), ...sign }, { merge: true });
            return b.commit();
          },
        };
      },
      async collectCook(c: Cook) {
        await updateDoc(doc(db, 'cooks', c.id), { done: true, ...sign });
        log('cookDone');
      },
      /** Changes a cook's time left. It can announce again if it was already ready. */
      editCookTime: (c: Cook, leftMins: number) => {
        const elapsed = Math.max(0, Math.round((Date.now() - (c.at?.toMillis() ?? Date.now())) / 60000));
        return updateDoc(doc(db, 'cooks', c.id), { mins: Math.max(1, elapsed + leftMins), ...(leftMins > 0 ? { told: false } : {}), ...sign });
      },

      // ---------- coke runs ----------
      async startRun(size: 'small' | 'large', count: number, crew: string, mins: number): Promise<Done> {
        const ref = await addDoc(collection(db, 'runs'), { by: me.name, crew: crew || me.name, size, n: count, mins, at: serverTimestamp(), done: false, told: false, ...sign });
        log('run');
        return { text: `Coke run started: ${count} ${size} brick${count === 1 ? '' : 's'}. Done in ${minsLabel(mins)}.`, undo: () => updateDoc(ref, { done: true, ...sign }) };
      },
      async finishRun(r: Run, to: string, label: string): Promise<Done | null> {
        const applied = await applyDeltas([{ loc: to, field: r.size === 'large' ? 'cokeLarge' : 'cokeSmall', delta: r.n }]);
        await updateDoc(doc(db, 'runs', r.id), { done: true, ...sign });
        made('cokeMade', r.n);
        log('coca');
        return {
          text: `${r.n} ${r.size} coke ${r.n === 1 ? 'brick' : 'bricks'} into ${label}`,
          undo: () => Promise.all([reverse(applied)(), updateDoc(doc(db, 'runs', r.id), { done: false, ...sign }), made('cokeMade', -r.n)]),
        };
      },
      cancelRun: (r: Run) => updateDoc(doc(db, 'runs', r.id), { done: true, ...sign }),

      // ---------- places (Manage ops) ----------
      async saveLocation(id: string | null, data: Partial<OpsLocation>) {
        const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
        if (id) await setDoc(doc(db, 'locations', id), { ...clean, ...sign }, { merge: true });
        else await addDoc(collection(db, 'locations'), { ...clean, ...sign });
        log('locations');
      },
      /** Removes a place. Everything it held moves to the Main Stash first. */
      async deleteLocation(loc: OpsLocation, stock: StockDoc | undefined) {
        const what: Delta[] = [];
        (Object.keys(ROOT_FIELDS) as RootField[]).forEach((f) => {
          const v = toCount(stock?.[f]);
          if (v) what.push({ loc: MAIN_STASH, field: f, delta: v });
        });
        STRAINS.forEach((st) =>
          BUD_FIELDS.forEach((f) => {
            const v = budCell(stock, st.id)[f];
            if (v) what.push({ loc: MAIN_STASH, strain: st.id, field: f, delta: v });
          }),
        );
        Object.entries(stock?.items ?? {}).forEach(([item, v]) => toCount(v) && what.push({ loc: MAIN_STASH, field: 'meth', item, delta: toCount(v) }));
        if (what.length) await applyDeltas(what);
        const b = writeBatch(db);
        b.delete(doc(db, 'stock', loc.id));
        b.delete(doc(db, 'locations', loc.id));
        await b.commit();
        log('locations');
      },
      async addItemType(name: string, category: string) {
        const ref = await addDoc(collection(db, 'itemTypes'), { name: name.trim().slice(0, 40), category, ...sign });
        return ref.id;
      },
      ensureMainStash: () =>
        setDoc(doc(db, 'locations', MAIN_STASH), { kind: 'stash', name: 'Main Stash', crewId: null, order: 0, ...sign }, { merge: true }),

      /**
       * "A meth cook is ready" (and the same for runs and grows) goes in the feed once, whoever's page sees it first.
       * A transaction makes sure only one page wins.
       */
      async claimReady(kind: 'cooks' | 'runs' | 'locations', id: string) {
        const field = kind === 'locations' ? 'alertSent' : 'told';
        const won = await runTransaction(db, async (tx) => {
          const ref = doc(db, kind, id);
          const s = await tx.get(ref);
          if (!s.exists() || s.data()[field]) return false;
          tx.update(ref, { [field]: true, ...sign });
          return true;
        }).catch(() => false);
        if (won) log(kind === 'cooks' ? 'cookReady' : kind === 'runs' ? 'runReady' : 'ready', 'ChosenOps');
        return won;
      },
    };
  }, [me.id, me.name, via]);
}

export type Ops = ReturnType<typeof useOps>;

/** Milliseconds a timer has left, from a Firestore timestamp and a length in minutes. */
export function timerLeft(at: Timestamp | null | undefined, mins: number, now: number) {
  const start = at?.toMillis() ?? now;
  const total = mins * 60000;
  return { start, total, pct: Math.max(0, Math.min(1, (now - start) / total)), leftSecs: Math.max(0, Math.ceil((start + total - now) / 1000)), done: now - start >= total };
}

export const MAIN = MAIN_STASH;
