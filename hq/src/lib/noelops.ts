import { getApps, initializeApp } from 'firebase/app';
import {
  connectDatabaseEmulator,
  getDatabase,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  update,
  type Database,
} from 'firebase/database';
import { useEffect, useState } from 'react';

/**
 * NoelOps runs the grows, cooks and coke runs, and owns the drug stock. The HQ reads its
 * Realtime Database live and writes drug sales and stock changes straight back, so both
 * apps always show the same counts. Its database rules are open, the same as NoelOps itself.
 */
export const NOELOPS_URL = 'https://fpselamite-cmd.github.io/noelops/';

const env = import.meta.env;
const CONFIG = {
  apiKey: 'AIzaSyBBINuk-Vve1ZCIzfM9atn6wcmkiLSb2UA',
  authDomain: 'noelops.firebaseapp.com',
  databaseURL: 'https://noelops-default-rtdb.firebaseio.com',
  projectId: 'noelops',
  appId: '1:890001351597:web:1b4dcfa187b362771f3724',
};
/** Everything NoelOps shares lives under this path. */
const ROOT = 'noelops';

let rtdb: Database | null = null;
export function noelDb() {
  if (rtdb) return rtdb;
  const app = getApps().find((a) => a.name === 'noelops') ?? initializeApp(CONFIG, 'noelops');
  rtdb = getDatabase(app);
  if (env.VITE_USE_EMULATORS === 'true') connectDatabaseEmulator(rtdb, window.location.hostname, 9000);
  return rtdb;
}
export const noelRef = (path = '') => ref(noelDb(), path ? `${ROOT}/${path}` : ROOT);

// ---------- Place ids ----------
// NoelOps keys stock by bucket: '%stash' (Main Stash), '%h<id>' (stash houses) and the encoded
// postal of a grow. The HQ uses 'main', 'noel_<id>' and 'g<postal>' for the same places.

export const NOEL_MAIN = '%stash';
const STASH_PREFIX = '%h';
export const locKey = (id: string) => encodeURIComponent(String(id)).replace(/\./g, '%2E');

export function hqIdOf(bucket: string) {
  if (bucket === NOEL_MAIN) return 'main';
  if (bucket.startsWith(STASH_PREFIX)) return `noel_${bucket.slice(STASH_PREFIX.length)}`;
  try {
    return `g${decodeURIComponent(bucket)}`;
  } catch {
    return `g${bucket}`;
  }
}

/** Buckets NoelOps has right now (kept current by the narcotics store). */
let known = new Set<string>([NOEL_MAIN]);
export const setKnownBuckets = (b: Iterable<string>) => (known = new Set([NOEL_MAIN, ...b]));

/** The NoelOps bucket for an HQ place, or null for places only the HQ has (and locker storages). */
export function bucketOf(hqId: string): string | null {
  if (hqId.includes('/')) return null;
  let b: string | null = null;
  if (hqId === 'main') b = NOEL_MAIN;
  else if (hqId.startsWith('noel_')) b = STASH_PREFIX + hqId.slice(5);
  else if (/^g.+/.test(hqId)) b = locKey(hqId.slice(1));
  if (b && !known.has(b)) return null;
  return b;
}

// ---------- Live data ----------

export interface NoelStash {
  name?: string;
  note?: string;
  excludeTotals?: boolean;
  order?: number;
}
export interface NoelGrow {
  id?: string;
  alias?: string;
  durationHours?: number;
  pots?: number;
  startTime?: number | null;
  strainPots?: Record<string, number>;
  storage?: boolean;
  stashTo?: string;
  excludeTotals?: boolean;
  order?: number;
}
export type NoelBucket = Record<string, unknown>;
export interface NoelCook {
  who?: string;
  size?: number;
  mins?: number;
  ts?: number;
}
export interface NoelRun {
  who?: string;
  crew?: string;
  size?: string;
  n?: number;
  mins?: number;
  ts?: number;
}

/** Live value of one NoelOps path. undefined while loading, null when missing; error is set when it can't be read. */
export function useNoel<T>(path: string, enabled = true): { data: T | null | undefined; error: boolean } {
  const [state, setState] = useState<{ path: string; data: T | null | undefined; error: boolean }>({ path, data: undefined, error: false });
  useEffect(() => {
    if (!enabled) return;
    return onValue(
      noelRef(path),
      (snap) => setState({ path, data: (snap.val() as T) ?? null, error: false }),
      () => setState({ path, data: null, error: true }),
    );
  }, [path, enabled]);
  return state.path === path ? { data: state.data, error: state.error } : { data: undefined, error: false };
}

// ---------- Writes ----------

const toCount = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export type NoelDelta = { bucket: string; strain?: string; field: string; delta: number };

/**
 * Changes counts in NoelOps' stock, one transaction per place, never below zero.
 * Returns the changes actually made (clamped), in the same order they were asked for.
 */
export async function applyNoelDeltas(deltas: NoelDelta[]): Promise<NoelDelta[]> {
  const out: NoelDelta[] = [];
  for (const bucket of [...new Set(deltas.map((d) => d.bucket))]) {
    const mine = deltas.filter((d) => d.bucket === bucket);
    let applied: NoelDelta[] = [];
    await runTransaction(noelRef(`stock/${bucket}`), (cur: unknown) => {
      const next: Record<string, unknown> = isObj(cur) ? { ...cur } : {};
      applied = [];
      for (const d of mine) {
        if (d.strain) {
          const cell = isObj(next[d.strain]) ? { ...(next[d.strain] as Record<string, unknown>) } : {};
          const have = toCount(cell[d.field]);
          const delta = Math.max(-have, d.delta);
          if (!delta) continue;
          next[d.strain] = { untrimmed: toCount(cell.untrimmed), trimmed: toCount(cell.trimmed), bricks: toCount(cell.bricks), [d.field]: have + delta };
          applied.push({ ...d, delta });
        } else {
          const have = toCount(next[d.field]);
          const delta = Math.max(-have, d.delta);
          if (!delta) continue;
          next[d.field] = have + delta;
          applied.push({ ...d, delta });
        }
      }
      return next;
    });
    out.push(...applied);
  }
  return out;
}

/** A line in NoelOps' live feed, so the crew there sees HQ activity too. */
export function noelActivity(who: string, kind: 'sale' | 'locations' | 'buds', text: { pre: string; hi: string; post: string }, loc?: string | null) {
  const r = push(noelRef('activity'));
  return update(r, { v: 1, kind, who, client: 'chosenops-hq', ...text, loc: loc ?? null, loc2: null, ts: serverTimestamp() }).catch(() => {});
}

/** Records an HQ sale in NoelOps' sales log. Returns its key, so it can be taken back out. */
export async function noelSale(s: { strain: string; bricks: number; bucket: string; who: string; by: string; cut: number; price: number | null; note: string; narco: boolean; hqId: string }) {
  const r = push(noelRef('sales'));
  const record: Record<string, unknown> = { strain: s.strain, bricks: s.bricks, bucket: s.bucket, who: s.who, by: s.by, cut: s.cut, ts: serverTimestamp(), note: s.note, hq: s.hqId };
  if (s.price != null) record.price = s.price;
  if (s.narco) record.src = 'narco';
  await update(r, record);
  noelActivity(s.by, 'sale', { pre: 'made', hi: 'a sale', post: 'in ChosenOps HQ' }, s.bucket);
  return r.key!;
}
export const removeNoelSale = (key: string) => remove(noelRef(`sales/${key}`)).catch(() => {});

/** Stash houses. New ones get the same kind of id NoelOps makes. */
export const newStashId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export function saveNoelStash(id: string, s: { name: string; note: string; excludeTotals?: boolean }, isNew: boolean) {
  if (id === 'main') return update(noelRef('settings/mainStash'), { name: s.name, ...(s.excludeTotals !== undefined ? { excludeTotals: s.excludeTotals } : {}) });
  return isNew
    ? update(noelRef(`stashes/${id}`), { name: s.name, note: s.note, excludeTotals: false, order: Date.now() })
    : update(noelRef(`stashes/${id}`), { name: s.name, note: s.note });
}

/** Deletes a stash house the way NoelOps does: its stock moves to the Main Stash and grows that sent harvests there now send them to the Main Stash. */
export async function deleteNoelStash(id: string, grows: Record<string, NoelGrow>) {
  const key = STASH_PREFIX + id;
  await runTransaction(noelRef('stock'), (cur: unknown) => {
    if (!isObj(cur)) return cur;
    const stock = { ...cur };
    const from = isObj(stock[key]) ? (stock[key] as Record<string, unknown>) : {};
    const to: Record<string, unknown> = isObj(stock[NOEL_MAIN]) ? { ...(stock[NOEL_MAIN] as Record<string, unknown>) } : {};
    for (const [k, v] of Object.entries(from)) {
      if (isObj(v)) {
        const t = isObj(to[k]) ? (to[k] as Record<string, unknown>) : {};
        to[k] = { untrimmed: toCount(t.untrimmed) + toCount(v.untrimmed), trimmed: toCount(t.trimmed) + toCount(v.trimmed), bricks: toCount(t.bricks) + toCount(v.bricks) };
      } else to[k] = toCount(to[k]) + toCount(v);
    }
    stock[NOEL_MAIN] = to;
    delete stock[key];
    return stock;
  });
  const changes: Record<string, unknown> = { [`stashes/${id}`]: null };
  Object.entries(grows).forEach(([k, g]) => {
    if (g?.stashTo === key) changes[`locations/${k}/stashTo`] = NOEL_MAIN;
  });
  await update(noelRef(), changes);
}
