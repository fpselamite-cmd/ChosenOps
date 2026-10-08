import { get, onValue, ref, runTransaction, update } from 'firebase/database';
import { noelDb } from './noelops';
import { rankCan } from './permissions';
import { NARCO_ROLE, type RoleHolder } from './roles';
import type { Member, Rank } from './types';

/**
 * Who gets into NoelOps' data, by sign-in account. Leadership's HQ pages keep this list in the database in step with
 * ranks and roles, and database.rules.json checks it:
 * - manage: leadership (and admins): everything, settings, places and the access list itself
 * - edit: the Narco role: grows, cooks, runs, stock and sales
 * - member: other blooded members: stash houses, the Main Stash name and NoelOps stats on profiles
 * Associates aren't on the list. `ops` lets someone with Manage ops add and rename stash houses.
 */
export type AccessLevel = 'member' | 'edit' | 'manage';
export interface AccessEntry {
  /** HQ member id */
  m: string;
  /** Their name, so NoelOps can show who's who */
  n: string;
  lvl: AccessLevel;
  ops?: boolean;
}

export function accessFor(m: Member, rank: Rank | undefined, holder: RoleHolder | undefined): Omit<AccessEntry, 'm' | 'n'> | null {
  if (m.status !== 'active') return null;
  const lead = m.admin === true || (!!rank && (rank.order === 0 || !!rank.leadership)) || holder?.lead === true;
  const ops = m.admin === true || rankCan(rank, 'manageOps') || holder?.perms?.manageOps === true;
  if (lead) return { lvl: 'manage', ops: true };
  if (m.rankId === 'associate') return null;
  if (holder?.roles?.includes(NARCO_ROLE)) return { lvl: 'edit', ...(ops ? { ops } : {}) };
  return { lvl: 'member', ...(ops ? { ops } : {}) };
}

/**
 * The whole list, keyed by sign-in account: a member's own id, or the newer account a PIN reset moved them to
 * (the old one is retired, so it gets nothing).
 */
export function wantedAccess(members: Member[], rankById: Map<string, Rank>, holderOf: Map<string, RoleHolder>) {
  const out: Record<string, AccessEntry> = {};
  for (const m of members) {
    const a = accessFor(m, rankById.get(m.rankId ?? ''), holderOf.get(m.id));
    if (a) out[m.authUid || m.id] = { m: m.id, n: m.name, ...a };
  }
  return out;
}

const same = (a: AccessEntry | undefined, b: AccessEntry) => !!a && a.m === b.m && a.n === b.n && a.lvl === b.lvl && !!a.ops === !!b.ops;

/** Only what changed: new and changed entries, and nulls for accounts that lost access. */
export function accessChanges(have: Record<string, AccessEntry>, want: Record<string, AccessEntry>) {
  const changes: Record<string, AccessEntry | null> = {};
  for (const [uid, e] of Object.entries(want)) if (!same(have[uid], e)) changes[`access/${uid}`] = e;
  for (const uid of Object.keys(have)) if (!(uid in want)) changes[`access/${uid}`] = null;
  return changes;
}

export const watchAccess = (cb: (v: Record<string, AccessEntry> | null, error: boolean) => void) =>
  onValue(
    ref(noelDb(), 'access'),
    (s) => cb((s.val() as Record<string, AccessEntry>) ?? {}, false),
    () => cb(null, true),
  );
export const writeAccess = (changes: Record<string, AccessEntry | null>) => update(ref(noelDb()), changes);

// ---------- Discord ----------
// The webhook address is kept where only leadership can read it. NoelOps queues its Discord messages in `outbox`,
// and whichever leadership page is open sends them on and clears them.

export interface Outgoing {
  body: string;
  ts: number;
}

export const watchOutbox = (cb: (v: Record<string, Outgoing>) => void) =>
  onValue(
    ref(noelDb(), 'outbox'),
    (s) => cb((s.val() as Record<string, Outgoing>) ?? {}),
    () => cb({}),
  );

/** Sends one queued message, if no other leadership page got to it first. */
export async function sendQueued(id: string) {
  let msg: Outgoing | null = null;
  const r = await runTransaction(ref(noelDb(), `outbox/${id}`), (cur: Outgoing | null) => {
    if (!cur) return undefined;
    msg = cur;
    return null;
  });
  if (!r.committed || !msg) return;
  const url = (await get(ref(noelDb(), 'private/webhookUrl'))).val() as string | null;
  if (!url || !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(url)) return;
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: (msg as Outgoing).body }).catch(() => {});
}
