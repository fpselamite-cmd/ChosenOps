import { addDoc, collection, doc, runTransaction, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { useMemo } from 'react';
import { useHub } from '../hooks/useHub';
import { db } from '../lib/firebase';
import { applyNoelDeltas, bucketOf, deleteNoelStash, newStashId, noelActivity, saveNoelStash, type NoelGrow } from '../lib/noelops';
import type { PageId } from '../lib/types';
import { MAIN_STASH, budCell, toCount, type BudField, type OpsLocation, type RootField, type StockDoc, type StrainId } from './data';

/** The live feed is vague on purpose: who did what kind of thing, never amounts, strains or postals. */
export const ACTIVITY_KINDS = {
  items: { pre: 'updated', hi: 'the armory', post: 'in a location' },
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

/** A stash's stock ('main') or any stock-shaped doc by path ('lockerStock/<member>__<storage>'). */
const stockRef = (loc: string) => (loc.includes('/') ? doc(db, loc) : doc(db, 'stock', loc));
/** Where one change lands: items in stock, drugs at a stash in drugStock (Narco only), lockers hold both. */
const refOf = (d: { loc: string; item?: string }) => (d.loc.includes('/') || d.item ? stockRef(d.loc) : doc(db, 'drugStock', d.loc));
export const lockerPath = (memberId: string, storageId: string) => `lockerStock/${memberId}__${storageId}`;

type Delta = { loc: string; strain?: StrainId; field: BudField | RootField; delta: number; item?: string };

/** Stock actions for the Stash, Locker, Blacksites and BlackMarket, signed with who did it and what opened the page. */
export function useOps(page: PageId = 'stash') {
  const { me, viaFor, narco } = useHub();
  const via = viaFor(page);

  return useMemo(() => {
    const sign = { _by: me.id, _via: via };

    const log = (kind: ActivityKind, who = me.name) =>
      addDoc(collection(db, 'activity'), { who, kind, ...ACTIVITY_KINDS[kind], at: serverTimestamp(), ...sign }).catch(() => {});

    /** Firestore part: items everywhere, and drugs in lockers and HQ-only places. */
    async function applyHq(deltas: Delta[]): Promise<Delta[]> {
      // Without Narco, drug changes are dropped: only Narco moves drugs.
      deltas = deltas.filter((d) => narco || d.item || d.loc.includes('/'));
      if (!deltas.length) return [];
      const refs = new Map(deltas.map((d) => [refOf(d).path, refOf(d)]));
      return runTransaction(db, async (tx) => {
        const snaps = new Map<string, StockDoc>();
        for (const [path, ref] of refs) {
          const s = await tx.get(ref);
          snaps.set(path, (s.exists() ? { id: ref.id, ...s.data() } : { id: ref.id }) as StockDoc);
        }
        const applied: Delta[] = [];
        const writes = new Map<string, Record<string, unknown>>();
        for (const d of deltas) {
          const cur = snaps.get(refOf(d).path)!;
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
          const w = writes.get(refOf(d).path) ?? {};
          if (d.item) w.items = { ...((w.items as object) ?? {}), [d.item]: next };
          else if (d.strain) w[d.strain] = { ...((w[d.strain] as object) ?? {}), [d.field]: next };
          else w[d.field] = next;
          writes.set(refOf(d).path, w);
          applied.push({ ...d, delta });
        }
        for (const [path, w] of writes) tx.set(refs.get(path)!, { ...w, ...sign, ...(path.startsWith('lockerStock/') ? { owner: me.id } : {}) }, { merge: true });
        return applied;
      });
    }

    /**
     * Applies stock changes, never letting a count go below zero, and returns the changes actually made
     * so Undo can reverse exactly those. Drug counts at NoelOps places go to NoelOps; everything else stays in the HQ.
     */
    async function applyDeltas(deltas: Delta[]): Promise<Delta[]> {
      const toNoel = (d: Delta) => !d.item && !!bucketOf(d.loc);
      const noel = narco ? deltas.filter(toNoel) : [];
      const hq = deltas.filter((d) => !toNoel(d));
      const [a, b] = await Promise.all([
        noel.length ? applyNoelDeltas(noel.map((d) => ({ bucket: bucketOf(d.loc)!, strain: d.strain, field: d.field, delta: d.delta }))) : Promise.resolve([]),
        applyHq(hq),
      ]);
      // Map NoelOps' answers back onto the asked-for deltas, in order.
      const left = [...a];
      const fromNoel = noel.flatMap((d) => {
        const i = left.findIndex((x) => x.bucket === bucketOf(d.loc) && x.strain === d.strain && x.field === d.field);
        if (i < 0) return [];
        const [x] = left.splice(i, 1);
        return [{ ...d, delta: x!.delta }];
      });
      return [...fromNoel, ...b];
    }
    const reverse = (applied: Delta[]) => () => applyDeltas(applied.map((d) => ({ ...d, delta: -d.delta })));

    return {
      via,
      log,
      /** Raw stock changes (any stash or locker storage), clamped at zero. */
      applyDeltas,
      reverse,

      async adjustItem(loc: string, item: string, delta: number, label: string): Promise<Done | null> {
        const applied = await applyDeltas([{ loc, field: 'meth', item, delta }]);
        if (!applied.length) return null;
        log('items');
        return { key: `item|${loc}|${item}`, text: `${label} ${applied[0]!.delta > 0 ? '+' : '−'}${Math.abs(applied[0]!.delta)}`, undo: reverse(applied) };
      },

      /**
       * Stash houses live in NoelOps (name, note); the HQ keeps its own extras (crew, postal) next to them.
       * A new one is made in NoelOps first, so both apps have it.
       */
      async saveLocation(id: string | null, data: Partial<OpsLocation>) {
        const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
        const noelId = id === MAIN_STASH ? 'main' : id?.startsWith('noel_') ? id.slice(5) : id ? null : newStashId();
        if (noelId) await saveNoelStash(noelId, { name: data.name ?? 'Stash', note: data.note ?? '' }, !id);
        const hqId = id ?? `noel_${noelId}`;
        await setDoc(doc(db, 'locations', hqId), { kind: 'stash', ...clean, ...sign }, { merge: true });
        log('locations');
        if (noelId) noelActivity(me.name, 'locations', { pre: 'updated', hi: 'the ops locations', post: '' });
        return hqId;
      },

      /** Removes a stash house. Everything it held moves to the Main Stash first. */
      async deleteLocation(loc: OpsLocation, stock: StockDoc | undefined, grows: Record<string, NoelGrow>) {
        const items: Delta[] = Object.entries(stock?.items ?? {}).flatMap(([item, v]) => (toCount(v) ? [{ loc: MAIN_STASH, field: 'meth' as const, item, delta: toCount(v) }] : []));
        if (loc.id.startsWith('noel_')) await deleteNoelStash(loc.id.slice(5), grows);
        else {
          // An HQ-only place: its drugs go to the Main Stash too.
          const drugs: Delta[] = [];
          for (const [k, v] of Object.entries(stock ?? {})) {
            if (k === 'id' || k === 'items' || k.startsWith('_') || k === 'owner') continue;
            if (v && typeof v === 'object') (['untrimmed', 'trimmed', 'bricks'] as const).forEach((f) => toCount((v as Record<string, unknown>)[f]) && drugs.push({ loc: MAIN_STASH, strain: k as StrainId, field: f, delta: toCount((v as Record<string, unknown>)[f]) }));
            else if (toCount(v)) drugs.push({ loc: MAIN_STASH, field: k as RootField, delta: toCount(v) });
          }
          if (drugs.length) await applyDeltas(drugs);
        }
        if (items.length) await applyDeltas(items);
        const b = writeBatch(db);
        b.delete(doc(db, 'stock', loc.id));
        if (narco) b.delete(doc(db, 'drugStock', loc.id));
        b.delete(doc(db, 'locations', loc.id));
        await b.commit();
        log('locations');
      },

      /** A member-made item, until the full catalog is in. Marked custom so admins can tidy them up later. */
      async addItemType(name: string, category: string) {
        const ref = await addDoc(collection(db, 'itemTypes'), { name: name.trim().slice(0, 40), category, custom: true, addedBy: me.name, ...sign });
        return ref.id;
      },
    };
  }, [me.id, me.name, via, narco]);
}

export type Ops = ReturnType<typeof useOps>;
