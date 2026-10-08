import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const RANKS = [
  ['boss', 0, { manageMembers: true }],
  ['underboss', 1, { manageMembers: true, approveMembers: true, manageCrews: true, resetPins: true, manageRanks: true }],
  ['capo', 2, { approveMembers: true }],
  ['soldier', 3, {}],
] as const;

const member = (name: string, rankId: string | null, status = 'active') => ({
  name,
  nameLower: name.toLowerCase(),
  status,
  rankId,
  reportsTo: null,
  avatar: null,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-chosenops',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'meta/hqFounding'), { uid: 'boss' });
    for (const [id, order, permissions] of RANKS) await setDoc(doc(db, 'hqRanks', id), { name: id, order, permissions });
    await setDoc(doc(db, 'members/boss'), member('Boss', 'boss'));
    await setDoc(doc(db, 'members/ub'), member('Ub', 'underboss'));
    await setDoc(doc(db, 'members/capo'), member('Capo', 'capo'));
    await setDoc(doc(db, 'members/sol'), member('Sol', 'soldier'));
    await setDoc(doc(db, 'members/sol2'), member('Sol2', 'soldier'));
    await setDoc(doc(db, 'members/newbie'), member('Newbie', null, 'pending'));
    await setDoc(doc(db, 'crews/grow'), { name: 'Grow Crew', tag: 'GRW', color: '#27ae60', leaderId: 'capo', memberIds: ['capo', 'sol'] });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe('sign-up', () => {
  it('lets a newcomer register as pending with their name', async () => {
    const db = as('fresh');
    const batch = writeBatch(db);
    batch.set(doc(db, 'members/fresh'), { ...member('Fresh', null, 'pending'), joinedAt: serverTimestamp() });
    batch.set(doc(db, 'names/fresh'), { uid: 'fresh', v: 0 });
    await assertSucceeds(batch.commit());
  });

  it('stops a newcomer making themselves active or Boss after founding', async () => {
    const db = as('sneaky');
    const batch = writeBatch(db);
    batch.set(doc(db, 'members/sneaky'), { ...member('Sneaky', 'boss'), joinedAt: serverTimestamp() });
    batch.set(doc(db, 'names/sneaky'), { uid: 'sneaky', v: 0 });
    await assertFails(batch.commit());
  });

  it('lets the very first person found the gang', async () => {
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'meta/hqFounding')));
    const db = as('founder');
    const batch = writeBatch(db);
    batch.set(doc(db, 'meta/hqFounding'), { uid: 'founder', at: serverTimestamp() });
    batch.set(doc(db, 'hqRanks/newrank'), { name: 'Boss2', order: 0, permissions: {} });
    batch.set(doc(db, 'members/founder'), { ...member('Founder', 'boss'), joinedAt: serverTimestamp() });
    batch.set(doc(db, 'names/founder'), { uid: 'founder', v: 0 });
    batch.set(doc(db, 'settings/gang'), { name: 'The Chosen', motto: 'x' });
    await assertSucceeds(batch.commit());
  });
});

describe('members', () => {
  it('hides the roster from pending members but shows their own file', async () => {
    await assertFails(getDoc(doc(as('newbie'), 'members/sol')));
    await assertSucceeds(getDoc(doc(as('newbie'), 'members/newbie')));
    await assertSucceeds(getDoc(doc(as('sol'), 'members/capo')));
  });

  it('lets you edit your own profile but not your rank', async () => {
    await assertSucceeds(updateDoc(doc(as('sol'), 'members/sol'), { alias: 'Shadow', bio: 'hi' }));
    await assertFails(updateDoc(doc(as('sol'), 'members/sol'), { rankId: 'boss' }));
    await assertFails(updateDoc(doc(as('sol'), 'members/sol2'), { alias: 'x' }));
  });

  it('lets officers approve newcomers only into ranks below their own', async () => {
    await assertSucceeds(updateDoc(doc(as('capo'), 'members/newbie'), { status: 'active', rankId: 'soldier' }));
  });
  it('blocks approving someone into your own rank or above', async () => {
    await assertFails(updateDoc(doc(as('capo'), 'members/newbie'), { status: 'active', rankId: 'capo' }));
    await assertFails(updateDoc(doc(as('sol'), 'members/newbie'), { status: 'active', rankId: 'soldier' }));
  });

  it('lets managers change rank and chain of command below them only', async () => {
    await assertSucceeds(updateDoc(doc(as('ub'), 'members/sol'), { rankId: 'capo', reportsTo: 'capo' }));
    await assertFails(updateDoc(doc(as('ub'), 'members/sol'), { rankId: 'underboss' }));
    await assertFails(updateDoc(doc(as('ub'), 'members/boss'), { status: 'suspended' }));
    await assertFails(updateDoc(doc(as('ub'), 'members/ub'), { rankId: 'boss' }));
  });

  it('locks out suspended members', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'members/sol2'), { status: 'suspended' }));
    await assertFails(getDoc(doc(as('sol2'), 'members/sol')));
  });
});

describe('crews', () => {
  it('lets members read crews', async () => {
    await assertSucceeds(getDoc(doc(as('sol2'), 'crews/grow')));
  });

  it('only lets leadership create crews', async () => {
    const crew = { name: 'Hit Squad', tag: 'HIT', color: '#c0392b', leaderId: null, memberIds: [] };
    await assertSucceeds(setDoc(doc(as('ub'), 'crews/hit'), crew));
    await assertFails(setDoc(doc(as('capo'), 'crews/hit2'), crew));
  });

  it('lets the crew leader add and remove members', async () => {
    await assertSucceeds(updateDoc(doc(as('capo'), 'crews/grow'), { memberIds: arrayUnion('sol2') }));
    await assertSucceeds(updateDoc(doc(as('capo'), 'crews/grow'), { memberIds: arrayRemove('sol') }));
  });

  it("stops the leader renaming the crew, handing off leadership, or leaving their own crew", async () => {
    await assertFails(updateDoc(doc(as('capo'), 'crews/grow'), { name: 'Capo Crew' }));
    await assertFails(updateDoc(doc(as('capo'), 'crews/grow'), { leaderId: 'sol' }));
    await assertFails(updateDoc(doc(as('capo'), 'crews/grow'), { memberIds: arrayRemove('capo') }));
  });

  it('stops ordinary members editing a crew', async () => {
    await assertFails(updateDoc(doc(as('sol'), 'crews/grow'), { memberIds: arrayUnion('sol2') }));
  });
});

describe('ranks', () => {
  it('lets rank managers edit ranks below them only', async () => {
    await assertSucceeds(updateDoc(doc(as('ub'), 'hqRanks/soldier'), { name: 'Soldato' }));
    await assertFails(updateDoc(doc(as('ub'), 'hqRanks/underboss'), { name: 'Me' }));
    await assertFails(updateDoc(doc(as('ub'), 'hqRanks/capo'), { order: 0 }));
    await assertFails(updateDoc(doc(as('capo'), 'hqRanks/soldier'), { name: 'x' }));
  });
});

describe('presence', () => {
  it('lets you check in for yourself only', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'presence/sol'), { at: serverTimestamp(), status: 'Growing' }));
    await assertFails(setDoc(doc(as('sol'), 'presence/sol2'), { at: serverTimestamp() }));
  });
});

describe('PIN reset', () => {
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');

  it('swaps the member onto a new sign-in account with a valid code', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'names/sol'), { uid: 'sol', v: 0 });
      await setDoc(doc(db, 'pinResets/sol'), { codeHash: sha('ABCD2345'), by: 'ub', expiresAt: Timestamp.fromMillis(Date.now() + 3600_000) });
    });
    const db = as('sol-new');
    const batch = writeBatch(db);
    batch.set(doc(db, 'authLinks/sol-new'), { memberId: 'sol', code: 'ABCD2345' });
    batch.update(doc(db, 'members/sol'), { authUid: 'sol-new' });
    batch.update(doc(db, 'names/sol'), { v: 1 });
    batch.delete(doc(db, 'pinResets/sol'));
    await assertSucceeds(batch.commit());
    // The old account is retired.
    await assertFails(getDoc(doc(as('sol'), 'members/capo')));
    await assertSucceeds(getDoc(doc(as('sol-new'), 'members/capo')));
  });

  it('rejects a wrong code', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'names/sol'), { uid: 'sol', v: 0 });
      await setDoc(doc(db, 'pinResets/sol'), { codeHash: sha('ABCD2345'), by: 'ub', expiresAt: Timestamp.fromMillis(Date.now() + 3600_000) });
    });
    const db = as('thief');
    const batch = writeBatch(db);
    batch.set(doc(db, 'authLinks/thief'), { memberId: 'sol', code: 'WRONG123' });
    batch.update(doc(db, 'members/sol'), { authUid: 'thief' });
    batch.update(doc(db, 'names/sol'), { v: 1 });
    batch.delete(doc(db, 'pinResets/sol'));
    await assertFails(batch.commit());
  });

  it('only lets officers issue codes for people below them', async () => {
    const reset = { codeHash: 'x', by: 'ub', expiresAt: Timestamp.fromMillis(Date.now() + 1000), at: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as('ub'), 'pinResets/sol'), reset));
    await assertFails(setDoc(doc(as('ub'), 'pinResets/boss'), reset));
    await assertFails(setDoc(doc(as('capo'), 'pinResets/sol'), { ...reset, by: 'capo' }));
  });
});

describe('petty crime', () => {
  const seedTransfer = (amount = 50, memberId = 'sol') =>
    env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'petty', memberId), { rep: 10 });
      await setDoc(doc(db, 'repTransfers/t1'), { memberId, amount, status: 'pending' });
      await setDoc(doc(db, 'stats/familyRep'), { total: 100 });
    });

  it('lets members set their own rep but not below zero or for others', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'petty/sol'), { rep: 40 }));
    await assertFails(setDoc(doc(as('sol'), 'petty/sol'), { rep: -1 }));
    await assertFails(setDoc(doc(as('sol'), 'petty/sol2'), { rep: 40 }));
  });

  it('lets members log their own crimes only', async () => {
    const c = { crime: 'ATM', rep: 5, cash: 1200, notes: '', at: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as('sol'), 'pettyLog/a'), { ...c, memberId: 'sol' }));
    await assertFails(setDoc(doc(as('sol'), 'pettyLog/b'), { ...c, memberId: 'sol2' }));
    const session = { memberId: 'sol', crime: 'Delivery ×6 · Arson ×2', crimes: { Delivery: 6, Arson: 2 }, perJob: [5, 5, 5, 5, 5, 5, 10, 10], rep: 50, cash: 9000, cashId: 'm1', notes: '', at: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as('sol'), 'pettyLog/s'), session));
    await assertFails(setDoc(doc(as('sol'), 'pettyLog/t'), { ...session, extra: 1 }));
  });

  it('keeps weekly goals to their member and the family goal to leadership', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'pettyGoals/sol'), { weekly: 500 }));
    await assertFails(setDoc(doc(as('sol'), 'pettyGoals/sol2'), { weekly: 500 }));
    await assertSucceeds(getDoc(doc(as('sol2'), 'pettyGoals/sol')));
    const g = { title: 'October push', target: 5000, by: '2026-10-31', from: serverTimestamp() };
    await assertFails(setDoc(doc(as('sol'), 'settings/pettyGoal'), g));
    await assertSucceeds(setDoc(doc(as('boss'), 'settings/pettyGoal'), g));
    await assertSucceeds(getDoc(doc(as('sol'), 'settings/pettyGoal')));
  });

  it('lets members request a transfer for themselves', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'repTransfers/x'), { memberId: 'sol', amount: 5, status: 'pending', at: serverTimestamp() }));
    await assertFails(setDoc(doc(as('sol'), 'repTransfers/y'), { memberId: 'sol', amount: 5, status: 'confirmed', at: serverTimestamp() }));
  });

  it('confirms a transfer by adding exactly its amount to the family', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'hqRanks/capo'), { 'permissions.confirmRep': true }),
    );
    await seedTransfer();
    const db = as('capo');
    const ok = writeBatch(db);
    ok.update(doc(db, 'repTransfers/t1'), { status: 'confirmed', decidedBy: 'capo', decidedAt: serverTimestamp() });
    ok.set(doc(db, 'stats/familyRep'), { total: 150, lastTransfer: 't1' });
    await assertSucceeds(ok.commit());
  });

  it('rejects padding the family total', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'hqRanks/capo'), { 'permissions.confirmRep': true }),
    );
    await seedTransfer();
    const db = as('capo');
    const bad = writeBatch(db);
    bad.update(doc(db, 'repTransfers/t1'), { status: 'confirmed', decidedBy: 'capo', decidedAt: serverTimestamp() });
    bad.set(doc(db, 'stats/familyRep'), { total: 9999, lastTransfer: 't1' });
    await assertFails(bad.commit());
  });

  it('gives the rep back when a transfer is rejected', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'hqRanks/capo'), { 'permissions.confirmRep': true }),
    );
    await seedTransfer();
    const db = as('capo');
    const b = writeBatch(db);
    b.update(doc(db, 'repTransfers/t1'), { status: 'rejected', decidedBy: 'capo', decidedAt: serverTimestamp() });
    b.set(doc(db, 'petty/sol'), { rep: 60, refundOf: 't1' });
    await assertSucceeds(b.commit());
  });

  it("doesn't let anyone without the power confirm, or confirm their own", async () => {
    await seedTransfer(50, 'capo');
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'hqRanks/capo'), { 'permissions.confirmRep': true }),
    );
    const own = as('capo');
    const b = writeBatch(own);
    b.update(doc(own, 'repTransfers/t1'), { status: 'confirmed', decidedBy: 'capo', decidedAt: serverTimestamp() });
    b.set(doc(own, 'stats/familyRep'), { total: 150, lastTransfer: 't1' });
    await assertFails(b.commit());

    const sol = as('sol');
    const c = writeBatch(sol);
    c.update(doc(sol, 'repTransfers/t1'), { status: 'confirmed', decidedBy: 'sol', decidedAt: serverTimestamp() });
    c.set(doc(sol, 'stats/familyRep'), { total: 150, lastTransfer: 't1' });
    await assertFails(c.commit());
  });
});

describe('ops: narcotics and stash', () => {
  const sign = (uid: string, via: string) => ({ _by: uid, _via: via });
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, 'hqRanks/capo'), { pages: { narcotics: true, stash: true } });
      await updateDoc(doc(db, 'crews/grow'), { pages: { narcotics: true } });
      await setDoc(doc(db, 'locations/main'), { kind: 'stash', name: 'Main Stash', crewId: null });
      await setDoc(doc(db, 'locations/g1'), { kind: 'grow', name: 'Docks', postal: '7078', crewId: 'grow', pots: 10, startTime: null });
    });
  });

  it('lets a rank with the page change stock', async () => {
    await assertSucceeds(setDoc(doc(as('capo'), 'stock/main'), { items: { pistol: 3 }, ...sign('capo', 'rank') }, { merge: true }));
  });

  it('lets a crew role open the page for a low rank', async () => {
    // sol is a Soldier (no Narcotics by rank) but is in the grow crew, whose role opens it
    await assertSucceeds(setDoc(doc(as('sol'), 'stock/main'), { items: { pistol: 3 }, ...sign('sol', 'grow') }, { merge: true }));
  });

  it('keeps drug counts to Narco: apart from items, unreadable and unwritable without the role', async () => {
    // Drug fields can't ride in a plain stock write, even for someone the page opens for.
    await assertFails(setDoc(doc(as('capo'), 'stock/main'), { meth: 3, ...sign('capo', 'rank') }, { merge: true }));
    await assertFails(setDoc(doc(as('capo'), 'drugStock/main'), { meth: 3, ...sign('capo', 'rank') }, { merge: true }));
    await assertFails(getDoc(doc(as('capo'), 'drugStock/main')));
    // High Table (and the Narco role) can.
    await assertSucceeds(setDoc(doc(as('boss'), 'drugStock/main'), { meth: 3, ...sign('boss', 'rank') }, { merge: true }));
    await assertSucceeds(getDoc(doc(as('boss'), 'drugStock/main')));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'roleHolders/capo'), { roles: ['narco'], perms: {}, pages: {}, lead: false }));
    await assertSucceeds(getDoc(doc(as('capo'), 'drugStock/main')));
    await assertSucceeds(setDoc(doc(as('capo'), 'stock/main'), { meth: 4, ...sign('capo', 'rank') }, { merge: true }));
    // Grows are Narco only too; others list stash houses.
    await assertFails(getDoc(doc(as('sol'), 'locations/g1')));
    await assertSucceeds(getDoc(doc(as('sol'), 'locations/main')));
    await assertSucceeds(getDocs(query(collection(as('sol'), 'locations'), where('kind', '==', 'stash'))));
    await assertFails(getDocs(collection(as('sol'), 'locations')));
    await assertSucceeds(getDoc(doc(as('capo'), 'locations/g1')));
  });

  it('keeps grow, stash and lab pins to Narco', async () => {
    const pin = (uid: string, type: string) => ({ name: 'Spot', type, x: 0.5, y: 0.5, scope: 'gang', ranks: [], crewIds: [], owner: uid, ownerName: uid, at: serverTimestamp() });
    await assertFails(setDoc(doc(as('sol'), 'pins/a'), pin('sol', 'grow')));
    await assertFails(setDoc(doc(as('sol'), 'narcoPins/a'), pin('sol', 'grow')));
    await assertSucceeds(setDoc(doc(as('sol'), 'pins/b'), pin('sol', 'meet')));
    await assertSucceeds(setDoc(doc(as('boss'), 'narcoPins/c'), pin('boss', 'grow')));
    await assertFails(getDoc(doc(as('sol'), 'narcoPins/c')));
    await assertSucceeds(getDoc(doc(as('boss'), 'narcoPins/c')));
    // An old drug pin in the shared collection: High Table moves it over exactly as it was.
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'pins/old'), { ...pin('sol', 'stash'), at: null }));
    await assertSucceeds(setDoc(doc(as('boss'), 'narcoPins/old'), { ...pin('sol', 'stash'), at: null }));
    await assertSucceeds(deleteDoc(doc(as('boss'), 'pins/old')));
  });

  it('rejects false claims about what opened the page', async () => {
    await assertFails(setDoc(doc(as('sol'), 'stock/main'), { meth: 3, ...sign('sol', 'rank') }, { merge: true }));
    await assertFails(setDoc(doc(as('sol2'), 'stock/main'), { meth: 3, ...sign('sol2', 'grow') }, { merge: true }));
    await assertFails(setDoc(doc(as('sol'), 'stock/main'), { meth: 3, ...sign('capo', 'grow') }, { merge: true }));
    await assertFails(setDoc(doc(as('sol'), 'stock/main'), { meth: 3 }, { merge: true }));
  });

  it('lets workers start timers but only Manage ops add or remove places', async () => {
    await assertSucceeds(updateDoc(doc(as('sol'), 'locations/g1'), { startTime: serverTimestamp(), alertSent: false, ...sign('sol', 'grow') }));
    await assertFails(updateDoc(doc(as('sol'), 'locations/g1'), { name: 'Mine now', ...sign('sol', 'grow') }));
    await assertFails(setDoc(doc(as('sol'), 'locations/new'), { kind: 'stash', name: 'X', crewId: null, ...sign('sol', 'grow') }));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'hqRanks/underboss'), { 'permissions.manageOps': true }));
    await assertSucceeds(setDoc(doc(as('ub'), 'locations/new'), { kind: 'stash', name: 'Docks House', crewId: null }));
    await assertFails(deleteDoc(doc(as('ub'), 'locations/main')));
  });

  it('lets anyone start a gang stash they own; owners run its settings, not its owners', async () => {
    const mine = { kind: 'stash', name: 'Sol House', crewId: null, createdBy: 'sol', owners: ['sol'] };
    await assertSucceeds(setDoc(doc(as('sol'), 'locations/sh'), mine));
    await assertFails(setDoc(doc(as('sol'), 'locations/sh2'), { ...mine, owners: ['sol', 'sol2'] }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'locations/sh'), { mins: { ar_armor_plate: 20 }, seeRank: 'soldier', takeRank: 'capo', values: { ar_armor_plate: 500 } }));
    await assertFails(updateDoc(doc(as('sol'), 'locations/sh'), { owners: ['sol', 'sol2'] }));
    await assertFails(updateDoc(doc(as('sol2'), 'locations/sh'), { mins: {} }));
    await assertSucceeds(updateDoc(doc(as('boss'), 'locations/sh'), { owners: [] }));
  });
  it('checks the take rank on a stash', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'locations/locked'), { kind: 'stash', name: 'Vault', crewId: null, takeRank: 'capo', owners: ['sol2'] });
      await updateDoc(doc(db, 'hqRanks/soldier'), { pages: { stash: true } });
    });
    await assertFails(setDoc(doc(as('sol'), 'stock/locked'), { items: { x: 1 }, ...sign('sol', 'rank') }, { merge: true }));
    await assertSucceeds(setDoc(doc(as('sol2'), 'stock/locked'), { items: { x: 1 }, ...sign('sol2', 'rank') }, { merge: true }));
    await assertSucceeds(setDoc(doc(as('capo'), 'stock/locked'), { items: { x: 2 }, ...sign('capo', 'rank') }, { merge: true }));
  });
  it('keeps the stash log and snapshots to admins; anyone writes their own moves', async () => {
    const move = { kind: 'take', by: 'sol', byName: 'Sol', from: 'main', to: null, fromLabel: 'Main', toLabel: '', key: 'x', label: 'Carbine', qty: 1, at: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as('sol'), 'stashLog/m1'), move));
    await assertFails(setDoc(doc(as('sol'), 'stashLog/m2'), { ...move, by: 'sol2' }));
    await assertFails(getDoc(doc(as('boss'), 'stashLog/m1')));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'members/ub'), { admin: true }));
    await assertSucceeds(getDoc(doc(as('ub'), 'stashLog/m1')));
    await assertSucceeds(setDoc(doc(as('sol'), 'stashSnaps/2026-10-07'), { day: '2026-10-07', counts: {}, at: serverTimestamp() }));
    await assertFails(getDoc(doc(as('sol'), 'stashSnaps/2026-10-07')));
  });
  it('sends return reminders that only the two people involved see', async () => {
    await assertSucceeds(setDoc(doc(as('capo'), 'nudges/n1'), { to: 'sol', from: 'capo', fromName: 'Capo', signoutId: 's1', text: 'Bring the rifle back', at: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(as('sol'), 'nudges/n1')));
    await assertFails(getDoc(doc(as('sol2'), 'nudges/n1')));
    await assertSucceeds(deleteDoc(doc(as('sol'), 'nudges/n1')));
  });

  it('only lets narcotics workers put cooks down', async () => {
    const cook = { by: 'x', size: 5, mins: 1440, at: serverTimestamp(), done: false, told: false };
    await assertSucceeds(setDoc(doc(as('capo'), 'cooks/c1'), { ...cook, ...sign('capo', 'rank') }));
    await assertFails(setDoc(doc(as('sol2'), 'cooks/c2'), { ...cook, ...sign('sol2', 'rank') }));
  });
});

describe('my locker', () => {
  it('keeps a locker private to its owner', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'lockerStock/sol__onme'), { owner: 'sol', meth: 1 }));
    await assertFails(getDoc(doc(as('sol2'), 'lockerStock/sol__onme')));
    await assertFails(getDoc(doc(as('boss'), 'lockerStock/sol__onme')));
    await assertFails(setDoc(doc(as('sol2'), 'lockerStock/sol__x'), { owner: 'sol2', meth: 1 }));
    await assertSucceeds(setDoc(doc(as('sol'), 'lockers/sol'), { storages: [{ id: 'onme', name: 'On Me' }] }));
    await assertFails(getDoc(doc(as('boss'), 'lockers/sol')));
  });

  it('lets leadership see sign-outs of gang property', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'hqRanks/underboss'), { 'permissions.money': true }));
    await assertSucceeds(setDoc(doc(as('sol'), 'signouts/s1'), { memberId: 'sol', status: 'out', qty: 1, at: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(as('ub'), 'signouts/s1')));
    await assertFails(getDoc(doc(as('sol2'), 'signouts/s1')));
  });
});

describe('trades', () => {
  beforeEach(() =>
    env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'trades/t1'), { from: 'sol', to: 'sol2', status: 'pending', qty: 2 })),
  );
  it('only the receiver accepts or declines', async () => {
    await assertFails(updateDoc(doc(as('sol'), 'trades/t1'), { status: 'accepted', closedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as('sol2'), 'trades/t1'), { status: 'accepted', closedAt: serverTimestamp() }));
  });
  it('the giver can cancel a pending trade, and nobody else can read it', async () => {
    await assertFails(getDoc(doc(as('capo'), 'trades/t1')));
    await assertSucceeds(updateDoc(doc(as('sol'), 'trades/t1'), { status: 'cancelled', closedAt: serverTimestamp() }));
  });
});

describe('trophies', () => {
  const award = (by: string, memberId: string) => ({ kind: 'award', by, memberId, title: 'Blacksite MVP', at: serverTimestamp() });
  it('lets leadership award anyone, but not ordinary members', async () => {
    await assertSucceeds(setDoc(doc(as('boss'), 'trophies/d'), award('boss', 'sol2')));
    await assertFails(setDoc(doc(as('sol'), 'trophies/e'), award('sol', 'sol2')));
  });
  it('lets members claim an achievement once, for themselves', async () => {
    const ach = { kind: 'achievement', by: 'achievement', memberId: 'sol', achId: 'harvester', tier: 1, title: 'Harvester I', at: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as('sol'), 'trophies/sol_harvester_1'), ach));
    await assertFails(setDoc(doc(as('sol'), 'trophies/random'), ach));
    await assertFails(setDoc(doc(as('sol2'), 'trophies/sol_harvester_2'), { ...ach, tier: 2 }));
  });
});

describe('money', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, 'hqRanks/soldier'), { pages: { blackmarket: true } });
      await updateDoc(doc(db, 'hqRanks/underboss'), { 'permissions.money': true });
      await setDoc(doc(db, 'sales/s1'), { sellerId: 'sol', qty: 1, price: 5000, callId: 'c1', team: ['sol2'] });
      await updateDoc(doc(db, 'hqRanks/capo'), { 'permissions.washMoney': true });
    });
  });
  it('shows the Narco log to the whole family', async () => {
    await assertSucceeds(getDoc(doc(as('sol'), 'sales/s1')));
    await assertSucceeds(getDoc(doc(as('sol2'), 'sales/s1')));
    await assertSucceeds(getDocs(collection(as('sol2'), 'sales')));
  });
  it('lets the call leader pay only the people who came along', async () => {
    const pay = { callId: 'c1', saleId: 's1', from: 'sol', to: 'sol2', dirty: 1000, source: 'sale', fromBank: 1000, at: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as('sol'), 'teamPays/p1'), pay));
    await assertFails(setDoc(doc(as('sol'), 'teamPays/p2'), { ...pay, to: 'ub' }));
    await assertFails(setDoc(doc(as('sol2'), 'teamPays/p3'), { ...pay, from: 'sol2', to: 'sol' }));
    await assertFails(setDoc(doc(as('sol'), 'teamPays/p4'), { ...pay, source: 'mine' }));
    await assertSucceeds(getDoc(doc(as('sol2'), 'teamPays/p1')));
    await assertSucceeds(getDoc(doc(as('ub'), 'teamPays/p1')));
    await assertFails(getDoc(doc(as('capo'), 'teamPays/p1')));
  });
  it('runs wash requests: member sends, a washer claims and finishes', async () => {
    const req = { memberId: 'sol', memberName: 'Sol', dirty: 10000, pct: 50, clean: 5000, status: 'open', claimerId: null, claimerName: null, note: '', at: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as('sol'), 'washRequests/w1'), req));
    await assertFails(setDoc(doc(as('sol'), 'washRequests/w2'), { ...req, clean: 20000 }));
    await assertFails(setDoc(doc(as('sol'), 'washRequests/w3'), { ...req, memberId: 'sol2' }));
    await assertFails(getDoc(doc(as('sol2'), 'washRequests/w1')));
    await assertSucceeds(getDoc(doc(as('capo'), 'washRequests/w1')));
    await assertFails(updateDoc(doc(as('sol2'), 'washRequests/w1'), { status: 'claimed', claimerId: 'sol2', claimerName: 'Sol2' }));
    await assertSucceeds(updateDoc(doc(as('capo'), 'washRequests/w1'), { status: 'claimed', claimerId: 'capo', claimerName: 'Capo' }));
    await assertFails(updateDoc(doc(as('sol'), 'washRequests/w1'), { status: 'cancelled', doneAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as('capo'), 'washRequests/w1'), { status: 'done', doneAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(as('sol'), 'washRequests/w4'), req));
    await assertSucceeds(updateDoc(doc(as('sol'), 'washRequests/w4'), { status: 'cancelled', doneAt: serverTimestamp() }));
  });
  it('lets sellers record their own sales only', async () => {
    const sale = { qty: 2, price: 9000, at: serverTimestamp(), _by: 'sol', _via: 'rank' };
    await assertSucceeds(setDoc(doc(as('sol'), 'sales/s2'), { ...sale, sellerId: 'sol' }));
    await assertFails(setDoc(doc(as('sol'), 'sales/s3'), { ...sale, sellerId: 'sol2' }));
  });
  it('keeps payouts and expenses to the Treasurer', async () => {
    await assertFails(setDoc(doc(as('sol'), 'ledger/l1'), { type: 'expense', amount: 10 }));
    await assertSucceeds(setDoc(doc(as('ub'), 'ledger/l1'), { type: 'payout', amount: 10, toId: 'sol' }));
    await assertSucceeds(getDoc(doc(as('sol'), 'ledger/l1')));
    await assertFails(getDoc(doc(as('sol2'), 'ledger/l1')));
  });
});

describe('crew list on member files', () => {
  it('crews are retired: an old crew list can be cleared but not added to', async () => {
    await assertFails(updateDoc(doc(as('sol'), 'members/sol'), { crewIds: ['grow'] }));
    await assertSucceeds(updateDoc(doc(as('capo'), 'members/sol'), { crewIds: [] }));
  });
  it('a crew leader removes someone and clears their crewIds in one go', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'members/sol'), { crewIds: ['grow'] }));
    const db = as('capo');
    const b = writeBatch(db);
    b.update(doc(db, 'crews/grow'), { memberIds: arrayRemove('sol') });
    b.update(doc(db, 'members/sol'), { crewIds: [] });
    await assertSucceeds(b.commit());
  });
});

describe('pins and events', () => {
  const aud = (owner: string, scope: string, ranks: string[] = [], crewIds: string[] = []) => ({ owner, scope, ranks, crewIds });
  const pin = (owner: string, scope: string, ranks: string[] = [], crewIds: string[] = []) => ({ ...aud(owner, scope, ranks, crewIds), name: 'Spot', type: 'meet', x: 0.5, y: 0.5 });
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, 'members/sol'), { crewIds: ['grow'] });
      await setDoc(doc(db, 'pins/mine'), pin('sol2', 'personal'));
      await setDoc(doc(db, 'pins/gang'), pin('sol2', 'gang'));
      await setDoc(doc(db, 'pins/top'), pin('boss', 'limited', ['boss', 'underboss']));
      await setDoc(doc(db, 'pins/growers'), pin('boss', 'limited', ['boss'], ['grow']));
    });
  });
  it('keeps personal pins to their owner', async () => {
    await assertSucceeds(getDoc(doc(as('sol2'), 'pins/mine')));
    await assertFails(getDoc(doc(as('sol'), 'pins/mine')));
    await assertFails(getDoc(doc(as('boss'), 'pins/mine')));
  });
  it('shows limited pins only to the listed ranks and crews, through queries too', async () => {
    await assertSucceeds(getDoc(doc(as('ub'), 'pins/top')));
    await assertFails(getDoc(doc(as('sol'), 'pins/top')));
    await assertSucceeds(getDoc(doc(as('sol'), 'pins/growers')));
    await assertFails(getDoc(doc(as('sol2'), 'pins/growers')));
    const db = as('sol');
    await assertSucceeds(getDocs(query(collection(db, 'pins'), where('scope', '==', 'gang'))));
    await assertSucceeds(getDocs(query(collection(db, 'pins'), where('owner', '==', 'sol'))));
    await assertSucceeds(getDocs(query(collection(db, 'pins'), where('scope', '==', 'limited'), where('ranks', 'array-contains', 'soldier'))));
    await assertSucceeds(getDocs(query(collection(db, 'pins'), where('scope', '==', 'limited'), where('crewIds', 'array-contains-any', ['grow']))));
    await assertFails(getDocs(query(collection(db, 'pins'), where('scope', '==', 'limited'), where('crewIds', 'array-contains-any', ['hit']))));
  });
  it('lets anyone drop personal or gang pins, but only leadership limit them', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'pins/a'), pin('sol', 'gang')));
    await assertSucceeds(setDoc(doc(as('sol'), 'pins/b'), pin('sol', 'personal')));
    await assertFails(setDoc(doc(as('sol'), 'pins/c'), pin('sol', 'limited', ['soldier'])));
    await assertSucceeds(setDoc(doc(as('boss'), 'pins/d'), pin('boss', 'limited', ['boss'])));
    await assertFails(setDoc(doc(as('sol'), 'pins/e'), pin('sol2', 'gang')));
    await assertFails(deleteDoc(doc(as('sol'), 'pins/gang')));
    await assertSucceeds(deleteDoc(doc(as('boss'), 'pins/gang')));
  });
  it('takes a postal, access notes, a photo and a stash link on a pin, and a map spot on an event', async () => {
    const full = { ...pin('sol', 'gang'), postal: '8021', access: 'Keypad 4471', photo: 'data:image/jpeg;base64,abc', stashId: 'main' };
    await assertSucceeds(setDoc(doc(as('sol'), 'pins/f'), full));
    await assertFails(setDoc(doc(as('sol'), 'pins/g'), { ...full, postal: '12345678901' }));
    await assertFails(setDoc(doc(as('sol'), 'pins/h'), { ...full, photo: 'x'.repeat(460000) }));
    const ev = { ...aud('sol', 'gang'), title: 'Buyer meet', kind: 'meeting', start: Timestamp.now(), mins: 30, repeat: 'none', rsvp: {}, pinId: 'f' };
    await assertSucceeds(setDoc(doc(as('sol'), 'events/e9'), ev));
  });
  it('lets people RSVP for themselves only', async () => {
    const ev = { ...aud('boss', 'gang'), title: 'Sit-down', kind: 'meeting', start: Timestamp.now(), mins: 60, repeat: 'weekly', rsvp: {} };
    await assertSucceeds(setDoc(doc(as('boss'), 'events/e1'), ev));
    await assertSucceeds(updateDoc(doc(as('sol'), 'events/e1'), { 'rsvp.sol': 'yes' }));
    await assertFails(updateDoc(doc(as('sol'), 'events/e1'), { 'rsvp.sol2': 'no' }));
    await assertFails(updateDoc(doc(as('sol'), 'events/e1'), { title: 'Party' }));
  });
});

describe('leaderboards', () => {
  it('lets members count only their own bricks; sales need the BlackMarket', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'boards/2026-10'), { bricks: { sol: increment(3) } }, { merge: true }));
    await assertFails(setDoc(doc(as('sol'), 'boards/2026-10'), { bricks: { sol2: increment(3) } }, { merge: true }));
    await assertFails(setDoc(doc(as('sol'), 'boards/2026-10'), { sales: { sol: increment(9000) } }, { merge: true }));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'hqRanks/soldier'), { pages: { blackmarket: true } }));
    await assertSucceeds(setDoc(doc(as('sol'), 'boards/2026-10'), { sales: { sol2: increment(9000) }, _by: 'sol', _via: 'rank' }, { merge: true }));
  });
  it('hands the top 3 of a finished month a trophy, once', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'boards/2020-01'), { sales: { sol: 90000, sol2: 1000 } }));
    const t = { kind: 'monthly', by: 'leaderboard', board: 'sales', month: '2020-01', tier: 3, place: 1, memberId: 'sol', title: 'Top Seller', at: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as('sol2'), 'trophies/sol_top_sales_2020-01'), t));
    await assertFails(setDoc(doc(as('sol2'), 'trophies/x'), t));
    await assertFails(setDoc(doc(as('sol2'), 'trophies/capo_top_sales_2020-01'), { ...t, memberId: 'capo' }));
    await assertSucceeds(updateDoc(doc(as('sol2'), 'boards/2020-01'), { awarded: true }));
    await assertFails(setDoc(doc(as('sol'), 'boards/2999-01'), { awarded: true }));
  });
});

describe('custom item names', () => {
  it('lets members name their own variant and rename only their own', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'itemTypes/v1'), { name: 'Pumpkin Bat', category: 'melee', baseId: 'm_bat', owner: 'sol' }));
    await assertFails(setDoc(doc(as('sol'), 'itemTypes/v2'), { name: 'Fake', category: 'melee', baseId: 'm_bat', owner: 'sol2' }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'itemTypes/v1'), { name: 'Spooky Bat' }));
    await assertFails(updateDoc(doc(as('sol2'), 'itemTypes/v1'), { name: 'Mine now' }));
    await assertFails(updateDoc(doc(as('sol'), 'itemTypes/v1'), { category: 'gun' }));
  });
});

describe('blacksites', () => {
  const fight = (by: string, extra = {}) => ({
    zone: 'Docks', at: Timestamp.now(), result: 'win', rivals: ['Ballas'], holdMins: 30, rep: 150,
    participants: ['sol', 'sol2', 'capo'], stats: {}, votes: {}, lootStatus: 'open', stashTo: 'main',
    closesAt: Timestamp.fromMillis(Date.now() + 86400e3), loggedBy: by, repStatus: 'pending', ...extra,
  });
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, 'hqRanks/capo'), { 'permissions.confirmRep': true });
      await setDoc(doc(db, 'blacksites/b1'), fight('sol'));
      await setDoc(doc(db, 'blacksites/b1/loot/l1'), { label: 'Carbine Rifle', item: 'g_carbine_rifle', field: 'meth', qty: 3, claims: {} });
      await setDoc(doc(db, 'stats/familyRep'), { total: 100 });
    });
  });
  it('lets anyone log a fight, with its rep pending', async () => {
    await assertSucceeds(setDoc(doc(as('sol2'), 'blacksites/b2'), fight('sol2')));
    await assertFails(setDoc(doc(as('sol2'), 'blacksites/b3'), fight('sol2', { repStatus: 'confirmed' })));
    await assertFails(setDoc(doc(as('sol2'), 'blacksites/b4'), fight('sol')));
  });
  it('lets participants fill their own line and vote for someone else', async () => {
    await assertSucceeds(updateDoc(doc(as('sol2'), 'blacksites/b1'), { 'stats.sol2': { kills: 4, downs: 1, logistics: 2, brought: ['plates'] }, 'votes.sol2': 'capo' }));
    await assertFails(updateDoc(doc(as('sol2'), 'blacksites/b1'), { 'stats.capo': { kills: 0 } }));
    await assertFails(updateDoc(doc(as('sol2'), 'blacksites/b1'), { 'votes.sol2': 'sol2' }));
    await assertFails(updateDoc(doc(as('ub'), 'blacksites/b1'), { 'votes.ub': 'sol' }));
  });
  it('adds the rep to the family only when Lieutenant+ confirms', async () => {
    await assertFails(updateDoc(doc(as('sol'), 'blacksites/b1'), { repStatus: 'confirmed', repBy: 'sol' }));
    const db = as('capo');
    const b = writeBatch(db);
    b.update(doc(db, 'blacksites/b1'), { repStatus: 'confirmed', repBy: 'capo' });
    b.set(doc(db, 'stats/familyRep'), { total: 250, lastBlacksite: 'b1' }, { merge: true });
    await assertSucceeds(b.commit());
    const db2 = as('capo');
    const b2 = writeBatch(db2);
    b2.set(doc(db2, 'stats/familyRep'), { total: 9999, lastBlacksite: 'b1' }, { merge: true });
    await assertFails(b2.commit());
  });
  it('lets participants claim loot while the draw is open, then dumps the rest', async () => {
    await assertSucceeds(updateDoc(doc(as('sol2'), 'blacksites/b1/loot/l1'), { qty: 2, 'claims.sol2': 1 }));
    await assertFails(updateDoc(doc(as('sol2'), 'blacksites/b1/loot/l1'), { qty: 0, 'claims.sol2': 1 }));
    await assertFails(updateDoc(doc(as('ub'), 'blacksites/b1/loot/l1'), { qty: 1, 'claims.ub': 1 }));
    await assertFails(updateDoc(doc(as('sol2'), 'blacksites/b1'), { lootStatus: 'closed', closedBy: 'sol2' }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'blacksites/b1'), { lootStatus: 'closed', closedBy: 'sol' }));
    await assertFails(updateDoc(doc(as('sol2'), 'blacksites/b1/loot/l1'), { qty: 1, 'claims.sol2': 2 }));
    await assertSucceeds(updateDoc(doc(as('sol2'), 'blacksites/b1/loot/l1'), { qty: 0, dumped: true }));
  });
  it('takes the call-in cost off the rep when a called-in fight is confirmed', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'blacksites/c1'), fight('sol', { calledIn: true, rep: 400 })));
    const d1 = as('capo');
    const bad = writeBatch(d1);
    bad.update(doc(d1, 'blacksites/c1'), { repStatus: 'confirmed', repBy: 'capo' });
    bad.set(doc(d1, 'stats/familyRep'), { total: 500, lastBlacksite: 'c1' }, { merge: true });
    await assertFails(bad.commit());
    const d2 = as('capo');
    const ok = writeBatch(d2);
    ok.update(doc(d2, 'blacksites/c1'), { repStatus: 'confirmed', repBy: 'capo' });
    ok.set(doc(d2, 'stats/familyRep'), { total: 350, lastBlacksite: 'c1' }, { merge: true });
    await assertSucceeds(ok.commit());
  });
  it('lets leadership split the loot and each fighter collect only their share', async () => {
    await assertFails(updateDoc(doc(as('sol'), 'blacksites/b1/loot/l1'), { qty: 1, assigned: { sol: 2 } }));
    await assertSucceeds(updateDoc(doc(as('boss'), 'blacksites/b1/loot/l1'), { qty: 1, assigned: { sol: 2 } }));
    await assertFails(updateDoc(doc(as('sol'), 'blacksites/b1/loot/l1'), { 'collected.sol': 3 }));
    await assertFails(updateDoc(doc(as('sol2'), 'blacksites/b1/loot/l1'), { 'collected.sol': 2 }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'blacksites/b1/loot/l1'), { 'collected.sol': 2 }));
  });
  it('lets anyone add a location; only leadership edits or removes one', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'blacksiteSpots/s1'), { name: 'Docks', x: null, y: null, notes: '', by: 'sol' }));
    await assertFails(updateDoc(doc(as('sol'), 'blacksiteSpots/s1'), { x: 0.5, y: 0.5 }));
    await assertSucceeds(updateDoc(doc(as('boss'), 'blacksiteSpots/s1'), { x: 0.5, y: 0.5, notes: 'Park behind the crane' }));
    await assertFails(deleteDoc(doc(as('sol'), 'blacksiteSpots/s1')));
    await assertSucceeds(updateDoc(doc(as('boss'), 'blacksites/b1'), { spotId: 's1', zone: 'Docks' }));
    await assertFails(updateDoc(doc(as('sol2'), 'blacksites/b1'), { spotId: 's2', zone: 'Pier' }));
  });
});

describe('NoelOps names', () => {
  it('lets leadership link a member to their NoelOps name, and nobody else', async () => {
    await assertSucceeds(updateDoc(doc(as('boss'), 'members/sol'), { noelName: 'Sol' }));
    await assertSucceeds(updateDoc(doc(as('boss'), 'members/sol'), { noelName: null }));
    await assertFails(updateDoc(doc(as('sol'), 'members/sol'), { noelName: 'Boss' }));
    await assertFails(updateDoc(doc(as('sol2'), 'members/sol'), { noelName: 'X' }));
    await assertFails(updateDoc(doc(as('boss'), 'members/sol'), { noelName: 'x'.repeat(31) }));
  });
});

describe('casino big wins', () => {
  const win = (by: string) => ({ by, name: 'Sol', game: 'slots', amount: 5000, note: 'Jackpot', at: serverTimestamp() });
  it('lets members post their own big wins and read the ticker', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'casinoWins/w1'), win('sol')));
    await assertFails(setDoc(doc(as('sol'), 'casinoWins/w2'), win('sol2')));
    await assertFails(setDoc(doc(as('sol'), 'casinoWins/w3'), { ...win('sol'), game: 'craps' }));
    await assertFails(setDoc(doc(as('sol'), 'casinoWins/w4'), { ...win('sol'), amount: -5 }));
    await assertSucceeds(getDoc(doc(as('sol2'), 'casinoWins/w1')));
    await assertFails(updateDoc(doc(as('sol'), 'casinoWins/w1'), { amount: 99999 }));
    await assertFails(deleteDoc(doc(as('sol'), 'casinoWins/w1')));
    await assertSucceeds(deleteDoc(doc(as('boss'), 'casinoWins/w1')));
  });
});

describe('gear & loadouts', () => {
  const build = (by: string) => ({ name: 'Blacksite rifleman', weaponId: 'w_mk18_rifle', parts: { sight: 'a1' }, notes: '', by, byName: by, likes: {} });
  it('lets anyone share a build; only the maker edits; anyone likes for themselves', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'builds/b1'), build('sol')));
    await assertFails(setDoc(doc(as('sol'), 'builds/b2'), build('sol2')));
    await assertSucceeds(updateDoc(doc(as('sol2'), 'builds/b1'), { 'likes.sol2': true }));
    await assertFails(updateDoc(doc(as('sol2'), 'builds/b1'), { 'likes.sol': true }));
    await assertFails(updateDoc(doc(as('sol2'), 'builds/b1'), { name: 'Mine' }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'builds/b1'), { name: 'Docks rifleman' }));
  });
  it('takes optional stats from the maker, and only leadership features a family build', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'builds/s1'), { ...build('sol'), public: true, stats: { damage: 7, range: 4 }, role: 'CQB', ttk: '4 body shots', pros: ['Fast'], cons: [] }));
    await assertFails(setDoc(doc(as('sol'), 'builds/s2'), { ...build('sol'), stats: { damage: 11 } }));
    await assertFails(setDoc(doc(as('sol'), 'builds/s3'), { ...build('sol'), stats: { luck: 3 } }));
    await assertFails(setDoc(doc(as('sol'), 'builds/s4'), { ...build('sol'), featured: true }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'builds/s1'), { stats: { damage: 8, accuracy: 6 }, role: 'Mid-range' }));
    await assertFails(updateDoc(doc(as('sol2'), 'builds/s1'), { stats: { damage: 1 } }));
    await assertFails(updateDoc(doc(as('sol'), 'builds/s1'), { featured: true }));
    await assertSucceeds(updateDoc(doc(as('boss'), 'builds/s1'), { featured: true }));
    await assertFails(updateDoc(doc(as('boss'), 'builds/s1'), { featured: false, name: 'Boss pick' }));
  });
  it('keeps a private loadout to its member and admins; public ones to all', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'loadouts/sol'), { public: false, vest: 'ar_class_iii_armor', plates: 3, utility: [] }));
    await assertFails(setDoc(doc(as('sol2'), 'loadouts/sol'), { public: true }));
    await assertFails(getDoc(doc(as('sol2'), 'loadouts/sol')));
    await assertSucceeds(getDoc(doc(as('boss'), 'loadouts/sol')));
    await assertSucceeds(getDoc(doc(as('ub'), 'loadouts/sol')));
    await assertSucceeds(setDoc(doc(as('sol'), 'loadouts/sol'), { public: true }, { merge: true }));
    await assertSucceeds(getDoc(doc(as('sol2'), 'loadouts/sol')));
  });
  it('keeps private builds to their maker, and saves are your own', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'builds/p1'), { ...build('sol'), public: false, tags: ['CQB'], saves: {} }));
    await assertFails(getDoc(doc(as('sol2'), 'builds/p1')));
    await assertSucceeds(getDoc(doc(as('sol'), 'builds/p1')));
    await assertSucceeds(getDocs(query(collection(as('sol2'), 'builds'), where('public', '==', true))));
    await assertSucceeds(getDocs(query(collection(as('sol'), 'builds'), where('by', '==', 'sol'))));
    await assertFails(getDocs(collection(as('sol2'), 'builds')));
    await assertSucceeds(setDoc(doc(as('sol'), 'builds/p2'), { ...build('sol'), public: true }));
    await assertSucceeds(updateDoc(doc(as('sol2'), 'builds/p2'), { 'saves.sol2': true }));
    await assertFails(updateDoc(doc(as('sol2'), 'builds/p2'), { 'saves.sol': true }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'builds/p2'), { public: false, tags: ['Run'] }));
  });
  it('lets leadership find builds from before the family/private choice and mark them family', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'builds/old1'), build('sol')));
    await assertFails(getDoc(doc(as('sol2'), 'builds/old1')));
    await assertSucceeds(getDocs(collection(as('boss'), 'builds')));
    await assertFails(updateDoc(doc(as('boss'), 'builds/old1'), { public: false }));
    await assertSucceeds(updateDoc(doc(as('boss'), 'builds/old1'), { public: true }));
    await assertSucceeds(getDoc(doc(as('sol2'), 'builds/old1')));
    await assertFails(updateDoc(doc(as('boss'), 'builds/old1'), { public: false }));
  });
  const kit = (owner: string, pub = false) => ({ owner, name: 'Heist', public: pub, mode: 'real', hotbar: [{ item: 'w_mk18_rifle', qty: 1, parts: {} }, null, null, null, null], bag: [], vest: null, plates: 2, bagType: null, outfit: 'Oni mask', vehicle: { name: 'Sultan RS', cls: 'sports' } });
  it('lets members keep kits: owner edits, the family sees public ones, leadership sees all', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'kits/k1'), kit('sol')));
    await assertFails(setDoc(doc(as('sol'), 'kits/k2'), kit('sol2')));
    await assertFails(setDoc(doc(as('sol'), 'kits/k3'), { ...kit('sol'), hotbar: [null, null, null, null, null, null] }));
    await assertFails(setDoc(doc(as('sol'), 'kits/k4'), { ...kit('sol'), extra: 1 }));
    await assertFails(getDoc(doc(as('sol2'), 'kits/k1')));
    await assertSucceeds(getDoc(doc(as('ub'), 'kits/k1')));
    await assertFails(updateDoc(doc(as('sol2'), 'kits/k1'), { name: 'Mine' }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'kits/k1'), { public: true }));
    await assertSucceeds(getDoc(doc(as('sol2'), 'kits/k1')));
    await assertSucceeds(getDocs(query(collection(as('sol'), 'kits'), where('owner', '==', 'sol'))));
    await assertSucceeds(setDoc(doc(as('sol'), 'kitPicks/sol'), { kit: 'k1' }));
    await assertFails(setDoc(doc(as('sol2'), 'kitPicks/sol'), { kit: 'k1' }));
    await assertSucceeds(getDoc(doc(as('sol2'), 'kitPicks/sol')));
    await assertFails(deleteDoc(doc(as('sol2'), 'kits/k1')));
    await assertSucceeds(deleteDoc(doc(as('sol'), 'kits/k1')));
  });
  it('keeps a shopping list private to its member', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'shopping/sol'), { items: [{ item: 't_molotov', qty: 2, from: 'Heist' }] }));
    await assertFails(getDoc(doc(as('sol2'), 'shopping/sol')));
    await assertFails(setDoc(doc(as('sol2'), 'shopping/sol'), { items: [] }));
    await assertFails(setDoc(doc(as('sol'), 'shopping/sol'), { items: [], extra: true }));
  });
  it('lets only ops managers put pictures on guns', async () => {
    await assertFails(setDoc(doc(as('sol'), 'gunArt/w_mk18_rifle'), { image: 'data:x', anchors: {} }));
    await assertSucceeds(setDoc(doc(as('boss'), 'gunArt/w_mk18_rifle'), { image: 'data:x', anchors: { sight: [40, 20] } }));
    await assertSucceeds(getDoc(doc(as('sol'), 'gunArt/w_mk18_rifle')));
  });
});

describe('discord hooks', () => {
  it('stay locked away from everyone now that Discord is gone', async () => {
    await assertFails(setDoc(doc(as('boss'), 'hooks/discord'), { blacksites: { url: '' } }));
    await assertFails(getDoc(doc(as('boss'), 'hooks/discord')));
    await assertFails(getDoc(doc(as('sol'), 'hooks/discord')));
  });
});

describe('family cards', () => {
  it('only the Boss (or a rank given family cards) gives them out; everyone sees them', async () => {
    const card = (by: string) => ({ image: 'data:image/jpeg;base64,xx', title: 'The Fool', by });
    await assertSucceeds(setDoc(doc(as('boss'), 'familyCards/sol'), card('boss')));
    await assertFails(setDoc(doc(as('ub'), 'familyCards/sol2'), card('ub')));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'hqRanks/underboss'), { 'permissions.familyCards': true }));
    await assertSucceeds(setDoc(doc(as('ub'), 'familyCards/sol2'), card('ub')));
    await assertFails(setDoc(doc(as('sol'), 'familyCards/sol'), card('sol')));
    await assertSucceeds(getDoc(doc(as('sol2'), 'familyCards/sol')));
    await assertSucceeds(deleteDoc(doc(as('boss'), 'familyCards/sol')));
  });
  it('lets members save their own look', async () => {
    await assertSucceeds(updateDoc(doc(as('sol'), 'members/sol'), { prefs: { accent: 'rose', sky: 'deep' } }));
    await assertFails(updateDoc(doc(as('sol2'), 'members/sol'), { prefs: { accent: 'rose' } }));
  });
});

describe('owners and admins', () => {
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'meta/owners'), { ids: ['sol2'] });
      await updateDoc(doc(db, 'members/sol2'), { admin: true });
      await setDoc(doc(db, 'settings/adminKey'), { hash: sha('chosenops-admin:open sesame'), by: 'sol2' });
    });
  });
  it('lets only an owner set the admin password; nobody reads it', async () => {
    const key = (by: string) => ({ hash: sha('chosenops-admin:new'), by });
    await assertSucceeds(setDoc(doc(as('sol2'), 'settings/adminKey'), key('sol2')));
    await assertFails(setDoc(doc(as('boss'), 'settings/adminKey'), key('boss')));
    await assertFails(getDoc(doc(as('sol2'), 'settings/adminKey')));
    await assertFails(setDoc(doc(as('boss'), 'meta/owners'), { ids: ['boss'] }));
    await assertSucceeds(getDoc(doc(as('sol2'), 'meta/owners')));
    await assertFails(getDoc(doc(as('boss'), 'meta/owners')));
  });
  it('makes a member admin with the right password only', async () => {
    const claim = async (uid: string, code: string) => {
      const db = as(uid);
      const b = writeBatch(db);
      b.set(doc(db, 'adminClaims', uid), { code, at: serverTimestamp() });
      b.update(doc(db, 'members', uid), { admin: true });
      return b.commit();
    };
    await assertFails(claim('sol', 'wrong'));
    await assertSucceeds(claim('sol', 'open sesame'));
    // Now an admin: admin is separate from rank, so even a Soldier admin can act on the Boss.
    await assertSucceeds(setDoc(doc(as('sol'), 'crews/new'), { name: 'New', tag: 'NEW', color: '#fff', leaderId: null, memberIds: [] }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'members/boss'), { status: 'suspended' }));
  });
  it('lets an admin pick any rank for themselves, the top one included; non-admins cannot', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'members/boss'), { admin: true }));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'members/sol'), { admin: true }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'members/sol'), { rankId: 'boss' }));
    await assertSucceeds(updateDoc(doc(as('boss'), 'members/boss'), { rankId: 'soldier' }));
    await assertFails(updateDoc(doc(as('sol'), 'members/sol'), { rankId: 'nope' }));
    await assertFails(updateDoc(doc(as('capo'), 'members/sol'), { rankId: 'boss' }));
    await assertSucceeds(updateDoc(doc(as('sol2'), 'members/boss'), { rankId: 'boss' }));
    await assertFails(updateDoc(doc(as('sol2'), 'members/capo'), { rankId: 'nope' }));
  });
  it('lets admins delete members of any rank, but not themselves or an owner', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'members/capo'), { admin: true }));
    await assertFails(deleteDoc(doc(as('sol'), 'members/newbie')));
    await assertFails(deleteDoc(doc(as('capo'), 'members/capo')));
    await assertFails(deleteDoc(doc(as('capo'), 'members/sol2')));
    await assertSucceeds(deleteDoc(doc(as('capo'), 'members/boss')));
    await assertSucceeds(deleteDoc(doc(as('capo'), 'members/sol')));
    await assertSucceeds(deleteDoc(doc(as('capo'), 'petty/sol')));
    await assertFails(deleteDoc(doc(as('ub'), 'petty/sol')));
  });
  it('only owners grant or take away admin; the Boss cannot', async () => {
    await assertSucceeds(updateDoc(doc(as('sol2'), 'members/sol'), { admin: true }));
    await assertFails(updateDoc(doc(as('boss'), 'members/sol'), { admin: false }));
    await assertSucceeds(updateDoc(doc(as('sol2'), 'members/sol'), { admin: false }));
    await assertFails(updateDoc(doc(as('boss'), 'members/capo'), { admin: true }));
  });
});

describe('signing up', () => {
  it('lets a new sign-in wait for its own file before it exists, but not read anyone else’s', async () => {
    await assertSucceeds(getDoc(doc(as('brandnew'), 'members/brandnew')));
    await assertFails(getDoc(doc(as('brandnew'), 'members/sol')));
  });
});

describe('character sheets', () => {
  it('lets anyone read a sheet but only its member write it', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'sheets/sol'), { traits: ['Loyal'], skills: { Driving: 4 }, song: 'https://youtu.be/dQw4w9WgXcQ' }));
    await assertSucceeds(getDoc(doc(as('sol2'), 'sheets/sol')));
    await assertFails(setDoc(doc(as('sol2'), 'sheets/sol'), { traits: ['Rat'] }));
    await assertFails(setDoc(doc(as('sol'), 'sheets/sol'), { rankId: 'boss' }));
  });

  it('keeps journal entries private until shared, and lets others only react', async () => {
    const entry = { memberId: 'sol', title: 'Day one', text: 'Joined up.', public: false, reactions: {}, at: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as('sol'), 'journal/j1'), entry));
    await assertFails(getDoc(doc(as('sol2'), 'journal/j1')));
    await assertSucceeds(updateDoc(doc(as('sol'), 'journal/j1'), { public: true }));
    await assertSucceeds(getDoc(doc(as('sol2'), 'journal/j1')));
    await assertSucceeds(updateDoc(doc(as('sol2'), 'journal/j1'), { 'reactions.sol2': '🔥' }));
    await assertFails(updateDoc(doc(as('sol2'), 'journal/j1'), { 'reactions.capo': '💀' }));
    await assertFails(updateDoc(doc(as('sol2'), 'journal/j1'), { text: 'hacked' }));
  });

  it('lets leadership write notes the member can read but not change', async () => {
    const note = { memberId: 'sol', kind: 'commendation', text: 'Held the hill.', by: 'ub', byName: 'Ub', at: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as('ub'), 'leaderNotes/n1'), note));
    await assertSucceeds(getDoc(doc(as('sol'), 'leaderNotes/n1')));
    await assertFails(getDoc(doc(as('sol2'), 'leaderNotes/n1')));
    await assertFails(setDoc(doc(as('sol'), 'leaderNotes/n2'), { ...note, by: 'sol', byName: 'Sol' }));
    await assertFails(deleteDoc(doc(as('sol'), 'leaderNotes/n1')));
  });
});

describe('dashboard', () => {
  it('lets members count their own streak but not set their own leave', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'streaks/sol'), { current: 1, best: 1, last: '2026-10-07', freezes: {}, loaFrom: null, loaUntil: null, at: serverTimestamp() }));
    await assertFails(setDoc(doc(as('sol'), 'streaks/sol'), { current: 2, best: 2, last: '2026-10-08', freezes: {}, loaFrom: '2026-10-01', loaUntil: '2026-12-01', at: serverTimestamp() }));
    await assertFails(setDoc(doc(as('sol2'), 'streaks/sol'), { current: 99, best: 99, last: '2026-10-08', freezes: {}, loaFrom: null, loaUntil: null, at: serverTimestamp() }));
  });

  it('lets an admin set leave on someone else’s streak', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'members/ub'), { ...member('Ub', 'underboss'), admin: true });
      await setDoc(doc(ctx.firestore(), 'streaks/sol'), { current: 3, best: 3, last: '2026-10-07', freezes: {}, loaFrom: null, loaUntil: null });
    });
    await assertSucceeds(updateDoc(doc(as('ub'), 'streaks/sol'), { loaFrom: '2026-10-08', loaUntil: '2026-10-20' }));
    await assertFails(updateDoc(doc(as('ub'), 'streaks/sol'), { current: 50 }));
    await assertFails(updateDoc(doc(as('capo'), 'streaks/sol'), { loaFrom: '2026-10-08', loaUntil: '2026-10-20' }));
  });

  it('only lets leadership pick the spotlight and post family news', async () => {
    await assertSucceeds(setDoc(doc(as('ub'), 'spotlight/today'), { memberId: 'sol', why: 'Held the hill', day: '2026-10-07', by: 'ub' }));
    await assertFails(setDoc(doc(as('sol'), 'spotlight/today'), { memberId: 'sol', why: 'me!', day: '2026-10-07', by: 'sol' }));
    await assertSucceeds(setDoc(doc(as('capo'), 'news/n1'), { kind: 'joined', memberId: 'sol2', rankId: 'soldier', at: serverTimestamp() }));
    await assertFails(setDoc(doc(as('sol'), 'news/n2'), { kind: 'promoted', memberId: 'sol', rankId: 'boss', at: serverTimestamp() }));
  });
});

describe('trades with counters and cash', () => {
  const offer = { v: 2, from: 'sol', fromName: 'Sol', fromStorage: 'onme', to: 'sol2', toName: 'Sol2', things: [], cash: { dirty: 500, clean: 0 }, status: 'pending' };
  it('lets the other side counter and the sender close the deal, then records the cash', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'trades/t1'), { ...offer, at: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as('sol2'), 'trades/t1'), { status: 'countered', back: [], backCash: { dirty: 0, clean: 100 }, backStorage: 'home', reply: 'deal?', closedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(as('sol'), 'cashMoves/t1_give'), { tradeId: 't1', from: 'sol', to: 'sol2', dirty: 500, clean: 0, at: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'trades/t1'), { status: 'done', fromCollected: true, closedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(as('sol'), 'cashMoves/t1_give'), { tradeId: 't1', from: 'sol', to: 'sol2', dirty: 500, clean: 0, at: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(as('sol2'), 'cashMoves/t1_back'), { tradeId: 't1', from: 'sol2', to: 'sol', dirty: 0, clean: 100, at: serverTimestamp() }));
    await assertFails(setDoc(doc(as('sol'), 'cashMoves/t1_back'), { tradeId: 't1', from: 'sol2', to: 'sol', dirty: 0, clean: 99999, at: serverTimestamp() }));
  });
  it('stops outsiders and wrong-side moves', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'trades/t2'), { ...offer, at: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('capo'), 'trades/t2'), { status: 'done' }));
    await assertFails(updateDoc(doc(as('sol'), 'trades/t2'), { status: 'done' }));
    await assertSucceeds(updateDoc(doc(as('sol2'), 'trades/t2'), { status: 'done', toCollected: true, closedAt: serverTimestamp() }));
  });
});

describe('locker storages', () => {
  it('lets a member read their own empty storage (so the first item can go in) but not someone else’s', async () => {
    await assertSucceeds(getDoc(doc(as('sol'), 'lockerStock/sol__onme')));
    await assertFails(getDoc(doc(as('sol'), 'lockerStock/sol2__onme')));
    await assertSucceeds(setDoc(doc(as('sol'), 'lockerStock/sol__onme'), { items: { lockpick: 1 }, owner: 'sol' }));
  });
});

describe('hall of fame', () => {
  it('lets leadership name the MVP, hang plaques and mark past members', async () => {
    await assertSucceeds(setDoc(doc(as('ub'), 'monthMvp/2026-10'), { memberId: 'sol', why: 'Held the docks', by: 'ub' }));
    await assertFails(setDoc(doc(as('sol'), 'monthMvp/2026-10'), { memberId: 'sol', why: 'me', by: 'sol' }));
    await assertSucceeds(setDoc(doc(as('ub'), 'legends/l1'), { memberId: 'sol', name: 'Sol', title: 'The Wall', text: 'Held it alone.', by: 'ub', at: serverTimestamp() }));
    await assertFails(setDoc(doc(as('sol'), 'legends/l2'), { memberId: 'sol', name: 'Sol', title: 'Me', text: '', by: 'sol', at: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(as('ub'), 'pastMembers/sol'), { kind: 'retired', day: '2026-10-07', epitaph: 'Good run.' }));
    await assertSucceeds(updateDoc(doc(as('ub'), 'members/sol'), { status: 'suspended', rankId: 'soldier' }));
    await assertFails(setDoc(doc(as('capo'), 'pastMembers/sol2'), { kind: 'exiled', day: '2026-10-07', epitaph: '' }));
  });
  it('keeps exiled members visible to leadership only', async () => {
    await assertSucceeds(setDoc(doc(as('ub'), 'pastMembers/sol2'), { kind: 'exiled', day: '2026-10-07', epitaph: '' }));
    await assertFails(getDoc(doc(as('capo'), 'pastMembers/sol2')));
    await assertSucceeds(getDoc(doc(as('ub'), 'pastMembers/sol2')));
  });
  it('lets anyone light only their own candle and leave a memory', async () => {
    await assertSucceeds(setDoc(doc(as('sol2'), 'tributes/sol'), { candles: { sol2: true } }, { merge: true }));
    await assertFails(setDoc(doc(as('sol2'), 'tributes/sol'), { candles: { capo: true } }, { merge: true }));
    await assertSucceeds(setDoc(doc(as('capo'), 'tributes/sol/memories/m1'), { by: 'capo', byName: 'Capo', text: 'Legend.', at: serverTimestamp() }));
    await assertFails(setDoc(doc(as('capo'), 'tributes/sol/memories/m2'), { by: 'sol2', byName: 'Sol2', text: 'fake', at: serverTimestamp() }));
  });
});

describe('personal cash', () => {
  it('lets members log their own cash only', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'myCash/c1'), { memberId: 'sol', dirty: 5000, clean: 0, note: 'Store job', at: serverTimestamp() }));
    await assertFails(setDoc(doc(as('sol'), 'myCash/c2'), { memberId: 'sol2', dirty: 5000, clean: 0, note: '', at: serverTimestamp() }));
    await assertFails(getDoc(doc(as('sol2'), 'myCash/c1')));
  });
});

describe('admin', () => {
  const makeAdmin = (id: string) => env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'members', id), { admin: true }));
  it('treats an admin of any rank as leadership, and lets them pick their own rank (any)', async () => {
    await assertFails(setDoc(doc(as('sol'), 'settings/pettyGoal'), { title: 'Q', target: 100, by: '2026-12-01' }));
    await makeAdmin('sol');
    await assertSucceeds(setDoc(doc(as('sol'), 'settings/pettyGoal'), { title: 'Q', target: 100, by: '2026-12-01' }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'members/sol'), { rankId: 'capo', reportsTo: 'boss' }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'members/sol'), { rankId: 'boss' }));
    await assertFails(updateDoc(doc(as('sol2'), 'members/sol2'), { rankId: 'capo' }));
  });
  it('keeps the feed to admins; anyone writes their own line', async () => {
    const line = (by: string) => ({ kind: 'rank', text: 'Sol moved to Capo', by, byName: by, target: 'sol', reason: '', at: serverTimestamp() });
    await assertSucceeds(setDoc(doc(as('capo'), 'adminFeed/f1'), line('capo')));
    await assertFails(setDoc(doc(as('capo'), 'adminFeed/f2'), line('boss')));
    await assertFails(getDocs(collection(as('boss'), 'adminFeed')));
    await makeAdmin('sol');
    await assertSucceeds(getDocs(collection(as('sol'), 'adminFeed')));
  });
  it('lets admins fix numbers: petty rep, locker cash, streaks, stats', async () => {
    const cash = { memberId: 'sol2', dirty: 500, clean: 0, note: 'Admin fix', at: serverTimestamp() };
    await assertFails(setDoc(doc(as('capo'), 'myCash/c1'), cash));
    await assertFails(setDoc(doc(as('capo'), 'petty/sol2'), { rep: 10 }));
    await makeAdmin('capo');
    await assertSucceeds(setDoc(doc(as('capo'), 'myCash/c1'), cash));
    await assertSucceeds(setDoc(doc(as('capo'), 'petty/sol2'), { rep: 10 }));
    await assertSucceeds(setDoc(doc(as('capo'), 'streaks/sol2'), { current: 3, best: 9, last: '2026-10-01', freezes: {}, loaFrom: null, loaUntil: null, at: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(as('capo'), 'stats/sol2'), { harvests: 4 }));
  });
  it('lets approvers leave a welcome note the newcomer can read and dismiss', async () => {
    await assertSucceeds(setDoc(doc(as('capo'), 'welcomes/newbie'), { text: 'Welcome in.', by: 'capo', byName: 'Capo', at: serverTimestamp() }));
    await assertFails(setDoc(doc(as('sol'), 'welcomes/sol2'), { text: 'Hi', by: 'sol', byName: 'Sol', at: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(as('capo'), 'welcomes/newbie')));
    await assertFails(getDoc(doc(as('sol'), 'welcomes/newbie')));
  });
  it('lets an admin rename someone and add their new sign-in name', async () => {
    const rename = (db: ReturnType<typeof as>) => {
      const b = writeBatch(db);
      b.update(doc(db, 'members/sol2'), { name: 'Solo', nameLower: 'solo' });
      b.set(doc(db, 'names/solo'), { uid: 'sol2', v: 0 });
      return b.commit();
    };
    await assertFails(rename(as('capo')));
    await makeAdmin('capo');
    await assertSucceeds(rename(as('capo')));
    await assertFails(updateDoc(doc(as('capo'), 'members/sol2'), { name: 'X', nameLower: 'y' }));
  });
  it('lets admins edit lists and defaults; admins can delete any account but an owner', async () => {
    await assertFails(setDoc(doc(as('sol'), 'settings/lists'), { crimes: [] }));
    await makeAdmin('sol');
    await assertSucceeds(setDoc(doc(as('sol'), 'settings/lists'), { crimes: [{ id: 'heist', name: 'Heist', icon: 'gem' }] }));
    await assertSucceeds(setDoc(doc(as('sol'), 'settings/defaults'), { callInCost: 200 }));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'meta/owners'), { ids: ['boss'] }));
    await assertFails(deleteDoc(doc(as('sol'), 'members/boss'))); // an owner
    await assertSucceeds(getDoc(doc(as('sol'), 'meta/owners'))); // admins can see who the owners are
    await assertSucceeds(getDocs(query(collection(as('boss'), 'sales'), where('sellerId', '==', 'sol2'))));
    await assertSucceeds(deleteDoc(doc(as('boss'), 'members/sol2')));
  });
});

describe('roles', () => {
  const grant = (memberId: string, h: Record<string, unknown>) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'roleHolders', memberId), { roles: ['x'], perms: {}, pages: {}, lead: false, ...h }));
  it('adds role powers on top of rank', async () => {
    const req = { name: 'Sol2', nameLower: 'sol2', status: 'pending', rankId: null, reportsTo: null, avatar: null };
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'members/fresh2'), req));
    await assertFails(updateDoc(doc(as('sol'), 'members/fresh2'), { status: 'suspended' }));
    await grant('sol', { perms: { approveMembers: true } });
    await assertSucceeds(updateDoc(doc(as('sol'), 'members/fresh2'), { status: 'suspended' }));
  });
  it('makes High Table count as leadership', async () => {
    const goal = { title: 'Q', target: 100, by: '2026-12-01' };
    await assertFails(setDoc(doc(as('sol'), 'settings/pettyGoal'), goal));
    await grant('sol', { lead: true });
    await assertSucceeds(setDoc(doc(as('sol'), 'settings/pettyGoal'), goal));
  });
  it('lets only leadership hand out roles', async () => {
    const h = { roles: ['washer'], perms: { washMoney: true }, pages: { blackmarket: true }, lead: false };
    await assertFails(setDoc(doc(as('sol'), 'roleHolders/sol'), h));
    await assertSucceeds(setDoc(doc(as('boss'), 'roleHolders/sol'), h));
    await assertSucceeds(getDoc(doc(as('sol2'), 'roleHolders/sol')));
    await assertFails(setDoc(doc(as('sol'), 'hqRoles/r1'), { name: 'Mine', perms: {}, pages: {} }));
    await assertSucceeds(setDoc(doc(as('boss'), 'hqRoles/r1'), { name: 'Washer', perms: { washMoney: true }, pages: {}, order: 1 }));
  });
});

describe('money & dues', () => {
  const mkTreasurer = () => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'roleHolders', 'capo'), { roles: [], perms: { money: true }, pages: {}, lead: false }));
  it('keeps the gang books to the Treasurer and leadership', async () => {
    const e = (by: string) => ({ dir: 'in', cash: 'clean', amount: 5000, category: 'Other', note: '', memberId: null, source: 'manual', ref: null, by, byName: by, at: serverTimestamp() });
    await assertFails(setDoc(doc(as('sol'), 'gangBook/b1'), e('sol')));
    await mkTreasurer();
    await assertSucceeds(setDoc(doc(as('capo'), 'gangBook/b1'), e('capo')));
    await assertFails(getDoc(doc(as('sol'), 'gangBook/b1')));
    await assertSucceeds(getDoc(doc(as('boss'), 'gangBook/b1')));
  });
  it('pays out in two steps: Treasurer sends, member confirms', async () => {
    await mkTreasurer();
    await assertSucceeds(setDoc(doc(as('capo'), 'payouts/p1'), { memberId: 'sol', memberName: 'Sol', cash: 'dirty', amount: 2000, reason: 'Loot', status: 'owed', by: 'capo', at: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('sol'), 'payouts/p1'), { status: 'received' }));
    await assertSucceeds(updateDoc(doc(as('capo'), 'payouts/p1'), { status: 'sent', sentAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('sol2'), 'payouts/p1'), { status: 'received' }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'payouts/p1'), { status: 'received' }));
  });
  it('lets members pay dues from their safe; the Treasurer confirms', async () => {
    await mkTreasurer();
    const db = as('sol');
    const b = writeBatch(db);
    b.set(doc(db, 'myCash/c1'), { memberId: 'sol', dirty: -3000, clean: 0, note: 'Dinner dues', at: serverTimestamp() });
    b.set(doc(db, 'duesPay/d1'), { memberId: 'sol', week: '2026-10-11', cash: 'dirty', amount: 3000, status: 'pending', cashId: 'c1', at: serverTimestamp() });
    await assertSucceeds(b.commit());
    await assertFails(updateDoc(doc(as('sol'), 'duesPay/d1'), { status: 'confirmed', decidedBy: 'sol' }));
    await assertSucceeds(updateDoc(doc(as('capo'), 'duesPay/d1'), { status: 'confirmed', decidedBy: 'capo' }));
    await assertFails(setDoc(doc(as('sol'), 'settings/dues'), { day: 0, byRank: {} }));
    await assertSucceeds(setDoc(doc(as('boss'), 'settings/dues'), { day: 0, byRank: { soldier: { rep: 50, clean: 1000, dirty: 2000 } } }));
    await assertSucceeds(setDoc(doc(as('capo'), 'duesWeeks/2026-10-11'), { owe: { sol: { rep: 50, clean: 1000, dirty: 2000 } }, excused: {} }));
    await assertSucceeds(setDoc(doc(as('sol'), 'repTransfers/t9'), { memberId: 'sol', amount: 50, status: 'pending', dues: '2026-10-11', at: serverTimestamp() }));
  });
  it('lets the washer set a timer on a wash they claimed', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'roleHolders', 'sol2'), { roles: ['washer'], perms: { washMoney: true }, pages: {}, lead: false }));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'washRequests', 'w1'), { memberId: 'sol', memberName: 'Sol', dirty: 1000, pct: 50, clean: 500, status: 'claimed', claimerId: 'sol2', claimerName: 'Sol2', note: '' }));
    await assertSucceeds(updateDoc(doc(as('sol2'), 'washRequests/w1'), { timerMins: 15, timerEnd: Timestamp.fromMillis(Date.now() + 900000) }));
    await assertFails(updateDoc(doc(as('sol'), 'washRequests/w1'), { timerMins: 5, timerEnd: Timestamp.fromMillis(Date.now() + 300000) }));
    await assertFails(updateDoc(doc(as('sol2'), 'washRequests/w1'), { timerMins: 999, timerEnd: null }));
  });
});

describe('rivals', () => {
  const gang = { name: 'Ballas', color: '#a855f7', relation: 'hostile', zones: [] };
  it('lets leadership keep case files; everyone reads them', async () => {
    await assertFails(setDoc(doc(as('sol'), 'rivals/b'), gang));
    await assertSucceeds(setDoc(doc(as('boss'), 'rivals/b'), gang));
    await assertSucceeds(getDoc(doc(as('sol'), 'rivals/b')));
    await assertFails(setDoc(doc(as('sol'), 'rivals/b/members/m1'), { name: 'Tiny', role: 'OG', threat: 'high' }));
    await assertSucceeds(setDoc(doc(as('boss'), 'rivals/b/members/m1'), { name: 'Tiny', role: 'OG', threat: 'high' }));
  });
  it('lets anyone log a sighting and mark who was last seen, nothing more', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'rivals/b/members/m1'), { name: 'Tiny', role: 'OG', threat: 'high' }));
    await assertSucceeds(setDoc(doc(as('sol'), 'sightings/s1'), { gangId: 'b', memberIds: ['m1'], postal: '8042', x: null, y: null, note: 'Outside Pillbox', by: 'sol', byName: 'Sol', at: serverTimestamp() }));
    await assertFails(setDoc(doc(as('sol'), 'sightings/s2'), { gangId: 'b', memberIds: [], postal: '', x: null, y: null, note: '', by: 'sol2', byName: 'Sol2', at: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'rivals/b/members/m1'), { lastSeenAt: serverTimestamp(), lastSeenWhere: 'postal 8042' }));
    await assertFails(updateDoc(doc(as('sol'), 'rivals/b/members/m1'), { threat: 'low' }));
    await assertFails(deleteDoc(doc(as('sol2'), 'sightings/s1')));
    await assertSucceeds(deleteDoc(doc(as('sol'), 'sightings/s1')));
  });
  it('lets anyone add incidents and notes as themselves', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'rivalIncidents/i1'), { gangId: 'b', kind: 'robbery', title: 'Hit our van', notes: '', where: 'Grove', outcome: 'loss', by: 'sol', byName: 'Sol', at: serverTimestamp() }));
    await assertFails(setDoc(doc(as('sol'), 'rivalIncidents/i2'), { gangId: 'b', kind: 'party', title: 'x', notes: '', where: '', outcome: null, by: 'sol', byName: 'Sol', at: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(as('sol'), 'rivalNotes/n1'), { gangId: 'b', text: 'Drive purple Buffalos', by: 'sol', byName: 'Sol', at: serverTimestamp() }));
    await assertFails(deleteDoc(doc(as('sol2'), 'rivalNotes/n1')));
    await assertSucceeds(deleteDoc(doc(as('boss'), 'rivalNotes/n1')));
  });
  it('bounties: leadership posts, anyone claims for themselves, leadership pays it out', async () => {
    const b = { gangId: 'b', memberId: 'm1', memberName: 'Tiny', amount: 25000, cash: 'dirty', reason: '', status: 'open', claimBy: null, claimName: null, claimProof: null, claimAt: null, by: 'sol', at: serverTimestamp() };
    await assertFails(setDoc(doc(as('sol'), 'bounties/x1'), b));
    await assertSucceeds(setDoc(doc(as('boss'), 'bounties/x1'), { ...b, by: 'boss' }));
    await assertFails(updateDoc(doc(as('sol'), 'bounties/x1'), { status: 'claimed', claimBy: 'sol2', claimName: 'Sol2', claimProof: 'clip', claimAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'bounties/x1'), { status: 'claimed', claimBy: 'sol', claimName: 'Sol', claimProof: 'clip', claimAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('sol'), 'bounties/x1'), { status: 'paid' }));
    const db = as('boss');
    const w = writeBatch(db);
    w.update(doc(db, 'bounties/x1'), { status: 'paid' });
    w.set(doc(db, 'payouts/bp1'), { memberId: 'sol', memberName: 'Sol', cash: 'dirty', amount: 25000, reason: 'Bounty: Tiny', status: 'owed', by: 'boss', at: serverTimestamp() });
    await assertSucceeds(w.commit());
  });
  it('keeps the red-string board to leadership', async () => {
    await assertFails(setDoc(doc(as('sol'), 'rivalBoard/main'), { nodes: [], links: [], legend: [] }));
    await assertSucceeds(setDoc(doc(as('boss'), 'rivalBoard/main'), { nodes: [], links: [], legend: [] }));
    await assertSucceeds(getDoc(doc(as('sol'), 'rivalBoard/main')));
  });
});

describe('welcome center', () => {
  const mkHandler = () => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'roleHolders', 'sol2'), { roles: ['welcome'], perms: { approveMembers: true }, pages: {}, lead: false }));
  it('lets handlers set up the checklist, not everyone', async () => {
    await mkHandler();
    const w = { steps: [{ id: 't1', title: 'Weed run' }], sections: [], repTarget: 300, rulesVersion: 1 };
    await assertFails(setDoc(doc(as('sol'), 'settings/welcome'), w));
    await assertSucceeds(setDoc(doc(as('sol2'), 'settings/welcome'), w));
    await assertSucceeds(getDoc(doc(as('sol'), 'settings/welcome')));
  });
  it('associates accept the rules and mark steps; handlers confirm and recommend', async () => {
    await mkHandler();
    await assertSucceeds(setDoc(doc(as('sol'), 'onboarding/sol'), { rulesAccepted: 1, rulesAt: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(as('sol'), 'onboarding/sol'), { recommended: { by: 'sol' } }, { merge: true }));
    await assertFails(getDoc(doc(as('capo'), 'onboarding/sol')));
    await assertSucceeds(getDoc(doc(as('sol2'), 'onboarding/sol')));
    await assertSucceeds(setDoc(doc(as('sol'), 'welcomeStamps/sol_t1'), { memberId: 'sol', stepId: 't1', status: 'pending', by: 'sol', byName: 'Sol', confirmedBy: null, at: serverTimestamp() }));
    await assertFails(setDoc(doc(as('sol'), 'welcomeStamps/sol_t2'), { memberId: 'sol', stepId: 't2', status: 'done', by: 'sol', byName: 'Sol', confirmedBy: 'sol', at: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(as('sol2'), 'welcomeStamps/sol_t1'), { memberId: 'sol', stepId: 't1', status: 'done', by: 'sol2', byName: 'Sol2', confirmedBy: 'sol2', at: serverTimestamp() }));
    await assertFails(deleteDoc(doc(as('sol'), 'welcomeStamps/sol_t1')));
    await assertSucceeds(setDoc(doc(as('sol2'), 'onboarding/sol'), { recommended: { by: 'sol2', byName: 'Sol2', note: '', at: serverTimestamp() } }, { merge: true }));
  });
  it('associates sign the Guide once; a handler clears it', async () => {
    await mkHandler();
    const sig = (img = 'data:image/png;base64,AAAA') => ({ guideSig: { name: 'Sol', img, pledge: 'I will', at: serverTimestamp() }, rulesAccepted: 1, rulesAt: serverTimestamp() });
    await assertFails(setDoc(doc(as('sol'), 'onboarding/sol'), sig('javascript:alert(1)'), { merge: true }));
    await assertFails(setDoc(doc(as('sol'), 'onboarding/sol'), { guideSig: { name: '', img: 'data:image/png;base64,AAAA', pledge: '', at: serverTimestamp() } }, { merge: true }));
    await assertSucceeds(setDoc(doc(as('sol'), 'onboarding/sol'), sig(), { merge: true }));
    await assertFails(setDoc(doc(as('sol'), 'onboarding/sol'), sig('data:image/png;base64,BBBB'), { merge: true }));
    await assertFails(setDoc(doc(as('sol'), 'onboarding/sol'), { guideSig: null }, { merge: true }));
    await assertSucceeds(setDoc(doc(as('sol2'), 'onboarding/sol'), { guideSig: null, rulesAccepted: 0 }, { merge: true }));
    await assertSucceeds(setDoc(doc(as('sol'), 'onboarding/sol'), sig(), { merge: true }));
  });
  it('keeps handler notes private; anyone vouches; only High Table patches in', async () => {
    await mkHandler();
    await assertFails(setDoc(doc(as('capo'), 'handlerNotes/h1'), { memberId: 'sol', text: 'x', by: 'capo', byName: 'Capo', at: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(as('sol2'), 'handlerNotes/h1'), { memberId: 'sol', text: 'Good', by: 'sol2', byName: 'Sol2', at: serverTimestamp() }));
    await assertFails(getDoc(doc(as('sol'), 'handlerNotes/h1')));
    await assertSucceeds(setDoc(doc(as('capo'), 'vouches/v1'), { memberId: 'sol', kind: 'vouch', text: '', by: 'capo', byName: 'Capo', at: serverTimestamp() }));
    await assertFails(setDoc(doc(as('sol'), 'vouches/v2'), { memberId: 'sol', kind: 'vouch', text: '', by: 'sol', byName: 'Sol', at: serverTimestamp() }));
    await assertFails(getDoc(doc(as('sol'), 'vouches/v1')));
    await assertFails(setDoc(doc(as('sol2'), 'graduations/sol'), { name: 'Sol', rankName: 'Soldier', at: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(as('boss'), 'graduations/sol'), { name: 'Sol', rankName: 'Soldier', at: serverTimestamp() }));
  });
});

describe('archives', () => {
  const mkArchivist = () => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'roleHolders', 'sol2'), { roles: ['archivist'], perms: {}, pages: {}, lead: false }));
  const mkAssoc = () => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'members/assoc'), member('Assoc', 'associate')));
  const note = (status: string) => ({ date: '2026-10-04', title: 'Family Dinner', present: [], excused: [], absent: [], topics: 'x', decisions: '', announcements: '', quote: '', quoteBy: '', minutes: '', ranks: [], status, by: 'sol2', byName: 'Sol2', at: serverTimestamp() });
  it('lets the Archivist write dinner notes; members read only published ones; associates read nothing', async () => {
    await mkArchivist();
    await mkAssoc();
    await assertFails(setDoc(doc(as('sol'), 'dinnerNotes/2026-10-04'), note('published')));
    await assertSucceeds(setDoc(doc(as('sol2'), 'dinnerNotes/2026-10-04'), note('draft')));
    await assertFails(getDoc(doc(as('sol'), 'dinnerNotes/2026-10-04')));
    await assertSucceeds(setDoc(doc(as('sol2'), 'dinnerNotes/2026-10-04'), note('published')));
    await assertSucceeds(getDoc(doc(as('sol'), 'dinnerNotes/2026-10-04')));
    await assertFails(getDoc(doc(as('assoc'), 'dinnerNotes/2026-10-04')));
  });
  it('lets members send in stories for approval, not publish them', async () => {
    await mkArchivist();
    const story = { kind: 'story', title: 'Docks', era: '', body: 'It happened.', order: 0, images: [], color: '#000', credit: 'Sol', status: 'submitted', by: 'sol', byName: 'Sol', at: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as('sol'), 'lore/s1'), story));
    await assertFails(setDoc(doc(as('sol'), 'lore/s2'), { ...story, status: 'published' }));
    await assertFails(setDoc(doc(as('sol'), 'lore/s3'), { ...story, kind: 'chapter' }));
    await assertSucceeds(getDoc(doc(as('sol'), 'lore/s1')));
    await assertFails(getDoc(doc(as('capo'), 'lore/s1')));
    await assertSucceeds(updateDoc(doc(as('sol2'), 'lore/s1'), { status: 'published' }));
    await assertSucceeds(getDoc(doc(as('capo'), 'lore/s1')));
    await assertFails(deleteDoc(doc(as('sol'), 'lore/s1')));
  });
  it('lets each member leave one reaction as themselves', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'archiveReacts/note:2026-10-04_sol'), { target: 'note:2026-10-04', memberId: 'sol', emoji: '🔥' }));
    await assertFails(setDoc(doc(as('sol'), 'archiveReacts/note:2026-10-04_sol2'), { target: 'note:2026-10-04', memberId: 'sol2', emoji: '🔥' }));
    await assertFails(setDoc(doc(as('sol'), 'archiveReacts/note:2026-10-04_sol'), { target: 'note:2026-10-04', memberId: 'sol', emoji: '💩' }));
    await assertFails(setDoc(doc(as('sol'), 'timeline/t1'), { date: '2026-01-01', title: 'x', note: '', by: 'sol' }));
  });
});

describe('honors', () => {
  const put = (id: string, h: Record<string, unknown>) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'honors', id), { kind: 'badge', name: id, rarity: 'rare', status: 'active', ...h }));
  it('lets you unlock a milestone for yourself, never a given honor or an expired season', async () => {
    await put('m1', { source: 'milestone', stat: 'runs', goal: 1 });
    await put('g1', { source: 'honor' });
    await put('old', { source: 'milestone', stat: 'runs', goal: 1, endsAt: Timestamp.fromMillis(Date.now() - 86400e3) });
    const mine = (h: string) => ({ memberId: 'sol', honorId: h, by: 'milestone', byName: '', note: '', seen: false, at: serverTimestamp() });
    await assertSucceeds(setDoc(doc(as('sol'), 'honorsOwned/sol_m1'), mine('m1')));
    await assertFails(setDoc(doc(as('sol'), 'honorsOwned/sol_g1'), mine('g1')));
    await assertFails(setDoc(doc(as('sol'), 'honorsOwned/sol_old'), mine('old')));
    await assertFails(setDoc(doc(as('sol'), 'honorsOwned/sol2_m1'), { ...mine('m1'), memberId: 'sol2' }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'honorsOwned/sol_m1'), { seen: true }));
    await assertFails(deleteDoc(doc(as('boss'), 'honorsOwned/sol_m1')));
  });
  it('lets High Table give and take back honors; the Archivist only proposes', async () => {
    await put('g1', { source: 'honor' });
    const gift = (by: string) => ({ memberId: 'sol', honorId: 'g1', by, byName: 'X', note: 'Well done', seen: false, at: serverTimestamp() });
    await assertFails(setDoc(doc(as('sol2'), 'honorsOwned/sol_g1'), gift('sol2')));
    await assertSucceeds(setDoc(doc(as('boss'), 'honorsOwned/sol_g1'), gift('boss')));
    await assertSucceeds(deleteDoc(doc(as('boss'), 'honorsOwned/sol_g1')));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'roleHolders', 'sol2'), { roles: ['archivist'], perms: {}, pages: {}, lead: false }));
    await assertSucceeds(setDoc(doc(as('sol2'), 'honors/p1'), { kind: 'title', name: 'X', rarity: 'epic', status: 'proposed', source: 'honor' }));
    await assertFails(setDoc(doc(as('sol2'), 'honors/p2'), { kind: 'title', name: 'X', rarity: 'epic', status: 'active', source: 'honor' }));
    await assertFails(setDoc(doc(as('sol2'), 'honors/p3'), { kind: 'title', name: 'X', rarity: 'mythic', status: 'proposed', source: 'honor' }));
  });
  it('keeps your loadout yours', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'honorLoadouts/sol'), { title: 'm1', showcase: ['a', 'b'] }));
    await assertFails(setDoc(doc(as('sol'), 'honorLoadouts/sol2'), { title: 'm1' }));
    await assertFails(setDoc(doc(as('sol'), 'honorLoadouts/sol'), { title: 'm1', hacked: true }));
  });
});

describe('casino', () => {
  const chips = (id: string, balance: number) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'chips', id), { balance }));
  it('keeps your stack yours and never below zero', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'chips/sol'), { balance: 1000 }));
    await assertFails(setDoc(doc(as('sol'), 'chips/sol2'), { balance: 1000000 }));
    await assertFails(updateDoc(doc(as('sol'), 'chips/sol'), { balance: -5 }));
  });
  it('makes gifts come out of the sender; grants only from High Table', async () => {
    await chips('sol', 500);
    const gift = { to: 'sol2', from: 'sol', fromName: 'Sol', amount: 200, reason: '', grant: false, claimed: false, at: serverTimestamp() };
    let db = as('sol');
    let b = writeBatch(db);
    b.update(doc(db, 'chips/sol'), { balance: 300 });
    b.set(doc(db, 'chipGifts/g1'), gift);
    await assertSucceeds(b.commit());
    await assertFails(setDoc(doc(as('sol'), 'chipGifts/g2'), gift)); // not taken from the stack
    await assertFails(setDoc(doc(as('sol'), 'chipGifts/g3'), { ...gift, grant: true }));
    await assertSucceeds(setDoc(doc(as('boss'), 'chipGifts/g4'), { ...gift, from: 'boss', grant: true }));
    await assertFails(updateDoc(doc(as('sol'), 'chipGifts/g1'), { claimed: true }));
    await chips('sol2', 0);
    db = as('sol2');
    b = writeBatch(db);
    b.update(doc(db, 'chipGifts/g1'), { claimed: true });
    b.update(doc(db, 'chips/sol2'), { balance: 200 });
    await assertSucceeds(b.commit());
  });
  it('sells shop honors only for their price', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'honors/s1'), { kind: 'title', name: 'Shark', rarity: 'rare', status: 'active', source: 'honor', price: 300 }));
    await chips('sol', 1000);
    const own = { memberId: 'sol', honorId: 's1', by: 'shop', byName: 'The chip shop', note: '', seen: false, at: serverTimestamp() };
    await assertFails(setDoc(doc(as('sol'), 'honorsOwned/sol_s1'), own));
    const db = as('sol');
    const b = writeBatch(db);
    b.update(doc(db, 'chips/sol'), { balance: 700 });
    b.set(doc(db, 'honorsOwned/sol_s1'), own);
    await assertSucceeds(b.commit());
  });
});

describe('live tables', () => {
  const table = { game: 'poker', name: 'T', host: 'sol', hostName: 'Sol', status: 'open', maxSeats: 3, minBet: 25, seats: { sol: { name: 'Sol', at: 1 } }, bets: {}, actions: {}, done: {}, last: {}, round: { n: 0, phase: 'idle' } };
  it('lets the host deal and others touch only their own seat and moves', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'casinoTables/t1'), { ...table, beat: serverTimestamp(), at: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('sol2'), 'casinoTables/t1'), { 'actions.sol2': { a: 'ante', n: 1, k: 1 } })); // not seated
    await assertSucceeds(updateDoc(doc(as('sol2'), 'casinoTables/t1'), { 'seats.sol2': { name: 'Sol2', at: 2 } }));
    await assertFails(updateDoc(doc(as('sol2'), 'casinoTables/t1'), { 'seats.capo': { name: 'Capo', at: 2 } }));
    await assertSucceeds(updateDoc(doc(as('sol2'), 'casinoTables/t1'), { 'actions.sol2': { a: 'ante', n: 1, k: 1 } }));
    await assertFails(updateDoc(doc(as('sol2'), 'casinoTables/t1'), { 'actions.sol': { a: 'fold', n: 1, k: 1 } }));
    await assertFails(updateDoc(doc(as('sol2'), 'casinoTables/t1'), { round: { n: 9, phase: 'paid' } }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'casinoTables/t1'), { round: { n: 1, phase: 'ante' } }));
    await assertFails(updateDoc(doc(as('sol2'), 'casinoTables/t1'), { host: 'sol2', hostName: 'Sol2', beat: serverTimestamp() })); // host isn't quiet
  });
  it('keeps poker hands private to the player and the dealer', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'casinoTables/t2'), { ...table, seats: { sol: { name: 'Sol', at: 1 }, sol2: { name: 'Sol2', at: 1 } } }));
    await assertSucceeds(setDoc(doc(as('sol'), 'casinoTables/t2/hands/sol2'), { cards: [], n: 1 }));
    await assertFails(setDoc(doc(as('sol2'), 'casinoTables/t2/hands/sol2'), { cards: [], n: 1 }));
    await assertSucceeds(getDoc(doc(as('sol2'), 'casinoTables/t2/hands/sol2')));
    await assertFails(getDoc(doc(as('capo'), 'casinoTables/t2/hands/sol2')));
  });
});

describe('polls', () => {
  const poll = (over: Record<string, unknown> = {}) => ({
    question: 'Dinner spot?', note: '', kind: 'single', options: [{ id: 'a', label: 'Pier' }, { id: 'b', label: 'Diner' }], ids: ['a', 'b'],
    audience: 'members', anonymous: false, reveal: 'live', official: false, closesAt: null, status: 'open', voters: [], logged: false,
    by: 'boss', byName: 'Boss', at: serverTimestamp(), ...over,
  });
  const seed = (id: string, over: Record<string, unknown> = {}) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'hqRanks/associate'), { name: 'Associate', order: 9, permissions: {} });
      await setDoc(doc(db, 'members/assoc'), member('Assoc', 'associate'));
      await setDoc(doc(db, 'polls', id), poll(over));
    });
  const vote = (uid: string, pid: string, picks: string[], anon = false, voteId?: string) => {
    const db = as(uid);
    const b = writeBatch(db);
    const v = anon ? doc(db, 'polls', pid, 'votes', voteId ?? 'v_' + uid) : doc(db, 'polls', pid, 'votes', uid);
    b.set(v, anon ? { picks, at: serverTimestamp() } : { picks, memberId: uid, name: uid, at: serverTimestamp() });
    b.set(doc(db, 'pollBallots', `${pid}_${uid}`), { pollId: pid, memberId: uid, voteId: v.id, at: serverTimestamp() });
    b.update(doc(db, 'polls', pid), { voters: arrayUnion(uid) });
    return b.commit();
  };

  it('lets only leadership ask', async () => {
    await assertSucceeds(setDoc(doc(as('boss'), 'polls/p1'), poll()));
    await assertFails(setDoc(doc(as('sol'), 'polls/p2'), poll({ by: 'sol' })));
    await assertFails(setDoc(doc(as('boss'), 'polls/p3'), poll({ voters: ['boss'] })));
  });
  it('keeps polls to their audience', async () => {
    await seed('p1', { audience: 'members' });
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'polls/p2'), poll({ audience: 'table' })));
    await assertSucceeds(getDoc(doc(as('sol'), 'polls/p1')));
    await assertFails(getDoc(doc(as('assoc'), 'polls/p1')));
    await assertFails(getDoc(doc(as('sol'), 'polls/p2')));
    await assertFails(getDocs(query(collection(as('assoc'), 'polls'), where('audience', '==', 'all'))));
    await assertSucceeds(getDocs(query(collection(as('sol'), 'polls'), where('audience', 'in', ['all', 'members']))));
    await assertSucceeds(getDocs(collection(as('boss'), 'polls')));
    await assertFails(vote('assoc', 'p1', ['a']));
  });
  it('takes one vote each, with valid picks, and lets you change it while open', async () => {
    await seed('p1');
    await assertFails(vote('sol', 'p1', ['a', 'b'])); // single choice
    await assertFails(vote('sol', 'p1', ['z']));
    await assertSucceeds(vote('sol', 'p1', ['a']));
    await assertFails(vote('sol', 'p1', ['b'])); // already voted
    await assertSucceeds(updateDoc(doc(as('sol'), 'polls/p1/votes/sol'), { picks: ['b'] }));
    await assertFails(updateDoc(doc(as('sol2'), 'polls/p1/votes/sol'), { picks: ['a'] }));
    // Can't add yourself to the voters without a ballot, or someone else.
    await assertFails(updateDoc(doc(as('sol2'), 'polls/p1'), { voters: arrayUnion('sol2') }));
    await assertFails(setDoc(doc(as('sol2'), 'pollBallots/p1_sol2'), { pollId: 'p1', memberId: 'sol2', voteId: 'sol' }));
  });
  it('keeps anonymous votes nameless', async () => {
    await seed('p1', { anonymous: true });
    const db = as('sol');
    const b = writeBatch(db);
    b.set(doc(db, 'polls/p1/votes/x1'), { picks: ['a'], memberId: 'sol', at: serverTimestamp() });
    b.set(doc(db, 'pollBallots/p1_sol'), { pollId: 'p1', memberId: 'sol', voteId: 'x1', at: serverTimestamp() });
    b.update(doc(db, 'polls/p1'), { voters: arrayUnion('sol') });
    await assertFails(b.commit());
    await assertSucceeds(vote('sol', 'p1', ['a'], true, 'x2'));
    await assertSucceeds(updateDoc(doc(as('sol'), 'polls/p1/votes/x2'), { picks: ['b'] }));
    await assertFails(getDoc(doc(as('sol2'), 'pollBallots/p1_sol')));
  });
  it('hides results until you vote (live) or until it closes', async () => {
    await seed('p1', { reveal: 'live' });
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'polls/p2'), poll({ reveal: 'closed' })));
    await vote('sol', 'p1', ['a']);
    await vote('sol', 'p2', ['a']);
    await assertFails(getDocs(collection(as('sol2'), 'polls/p1/votes')));
    await assertSucceeds(getDocs(collection(as('sol'), 'polls/p1/votes')));
    await assertFails(getDocs(collection(as('sol'), 'polls/p2/votes')));
    await assertFails(getDocs(collection(as('boss'), 'polls/p2/votes')));
    await assertSucceeds(getDoc(doc(as('sol'), 'polls/p2/votes/sol'))); // your own
    await assertFails(updateDoc(doc(as('sol'), 'polls/p2'), { status: 'closed' }));
    await assertSucceeds(updateDoc(doc(as('boss'), 'polls/p2'), { status: 'closed', closedAt: serverTimestamp() }));
    await assertSucceeds(getDocs(collection(as('sol2'), 'polls/p2/votes')));
    await assertFails(vote('sol2', 'p2', ['a'])); // closed
  });
  it('closes itself at the deadline', async () => {
    await seed('p1', { closesAt: Timestamp.fromMillis(Date.now() - 1000) });
    await assertFails(vote('sol', 'p1', ['a']));
    await assertSucceeds(getDocs(collection(as('sol'), 'polls/p1/votes')));
  });
  it('lets the audience comment and leadership tidy up', async () => {
    await seed('p1');
    const c = { by: 'sol', name: 'Sol', text: 'The pier, obviously', at: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as('sol'), 'polls/p1/comments/c1'), c));
    await assertFails(setDoc(doc(as('sol'), 'polls/p1/comments/c2'), { ...c, text: 'x'.repeat(300) }));
    await assertFails(setDoc(doc(as('assoc'), 'polls/p1/comments/c3'), { ...c, by: 'assoc' }));
    await assertFails(deleteDoc(doc(as('sol2'), 'polls/p1/comments/c1')));
    await assertSucceeds(deleteDoc(doc(as('boss'), 'polls/p1/comments/c1')));
    await assertFails(deleteDoc(doc(as('sol'), 'polls/p1')));
    await assertSucceeds(deleteDoc(doc(as('boss'), 'polls/p1')));
  });
  it('keeps templates to leadership', async () => {
    await assertSucceeds(setDoc(doc(as('boss'), 'pollTemplates/t1'), { name: 'Dinner' }));
    await assertFails(getDoc(doc(as('sol'), 'pollTemplates/t1')));
  });
});

describe('party cards', () => {
  const note = (by: string, over: Record<string, unknown> = {}) => ({ party: 'birthday_sol_2026', for: 'sol', kind: 'birthday', label: 'Birthday', by, name: by, text: 'Happy birthday!', at: serverTimestamp(), ...over });
  it('lets the family sign, but not your own card or as someone else', async () => {
    await assertSucceeds(setDoc(doc(as('sol2'), 'partyNotes/birthday_sol_2026_sol2'), note('sol2')));
    await assertFails(setDoc(doc(as('sol'), 'partyNotes/birthday_sol_2026_sol'), note('sol')));
    await assertFails(setDoc(doc(as('sol2'), 'partyNotes/birthday_sol_2026_capo'), note('capo')));
    await assertFails(setDoc(doc(as('capo'), 'partyNotes/birthday_sol_2026_capo'), note('capo', { for: 'sol2' })));
    await assertFails(setDoc(doc(as('capo'), 'partyNotes/birthday_sol_2026_capo'), note('capo', { text: 'x'.repeat(201) })));
    await assertFails(deleteDoc(doc(as('capo'), 'partyNotes/birthday_sol_2026_sol2')));
    await assertSucceeds(deleteDoc(doc(as('sol2'), 'partyNotes/birthday_sol_2026_sol2')));
  });
});

describe('welcome guide', () => {
  const base = { steps: [], sections: [], rulesVersion: 1, repTarget: 0 };
  it('takes a Canva view-only embed link, never an edit link', async () => {
    await assertSucceeds(setDoc(doc(as('boss'), 'settings/welcome'), { ...base, canva: 'https://www.canva.com/design/DAHP38j5-V0/abc_123/view?embed' }));
    await assertSucceeds(setDoc(doc(as('boss'), 'settings/welcome'), { ...base, canva: '' }));
    await assertFails(setDoc(doc(as('boss'), 'settings/welcome'), { ...base, canva: 'https://www.canva.com/design/DAHP38j5-V0/abc_123/edit' }));
    await assertFails(setDoc(doc(as('boss'), 'settings/welcome'), { ...base, canva: 'https://evil.example/x' }));
  });
});

describe('radio', () => {
  const r = { freq: '601.11', password: 'x', note: '', byName: 'Boss', at: serverTimestamp() };
  it('keeps the family and heist channels from associates', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'hqRanks/associate'), { name: 'Associate', order: 9, permissions: {} });
      await setDoc(doc(db, 'members/assoc'), member('Assoc', 'associate'));
      await setDoc(doc(db, 'radio/main'), { freq: '1', password: 'p' });
      await setDoc(doc(db, 'radio/associate'), { freq: '2', password: 'p' });
    });
    await assertSucceeds(getDoc(doc(as('assoc'), 'radio/associate')));
    await assertFails(getDoc(doc(as('assoc'), 'radio/main')));
    await assertFails(getDoc(doc(as('assoc'), 'radio/heist')));
    await assertSucceeds(getDoc(doc(as('sol'), 'radio/main')));
  });
  it('lets leadership set channels, not members', async () => {
    await assertSucceeds(setDoc(doc(as('boss'), 'radio/heist'), { ...r, active: true }));
    await assertFails(setDoc(doc(as('sol'), 'radio/main'), r));
    await assertFails(setDoc(doc(as('boss'), 'radio/other'), r));
    await assertFails(setDoc(doc(as('boss'), 'radio/main'), { ...r, extra: 1 }));
  });
});

describe('admin is separate from rank', () => {
  it('lets a Soldier admin edit and reorder any rank', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'members/sol'), { admin: true }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'hqRanks/underboss'), { name: 'Underboss 2' }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'hqRanks/capo'), { order: 1 }));
    await assertFails(updateDoc(doc(as('sol2'), 'hqRanks/capo'), { name: 'x' }));
  });
});

describe('heists', () => {
  const h = { name: 'Fleeca', target: 'Fleeca bank', notes: '', size: 4, when: null, requests: {}, crew: [], roles: {}, status: 'planned', outcome: null, take: 0, cashGiven: {}, cashCollected: {}, banked: false, report: '', by: 'boss', byName: 'Boss', at: serverTimestamp(), liveAt: null, doneAt: null };
  const seedAssoc = () =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'hqRanks/associate'), { name: 'Associate', order: 9, permissions: {} });
      await setDoc(doc(ctx.firestore(), 'members/assoc'), member('Assoc', 'associate'));
    });
  it('lets leadership plan and pick the crew; members only ask for themselves; never associates', async () => {
    await seedAssoc();
    await assertSucceeds(setDoc(doc(as('boss'), 'heists/h1'), h));
    await assertFails(setDoc(doc(as('sol'), 'heists/h2'), { ...h, by: 'sol' }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'heists/h1'), { 'requests.sol': { role: 'Driver', note: 'I can drive', at: 1 } }));
    await assertFails(updateDoc(doc(as('sol'), 'heists/h1'), { 'requests.sol2': { role: 'Driver', note: '', at: 1 } }));
    await assertFails(updateDoc(doc(as('sol'), 'heists/h1'), { crew: ['sol'] }));
    await assertSucceeds(updateDoc(doc(as('boss'), 'heists/h1'), { crew: ['sol'], roles: { sol: 'Driver' } }));
    await assertFails(getDoc(doc(as('assoc'), 'heists/h1')));
  });
  it('pays out cash and items: members collect only what they were given; the rest goes to the bank', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'heists/h1'), { ...h, status: 'done', take: 1000, crew: ['sol'], cashGiven: { sol: 300 } }));
    await assertFails(updateDoc(doc(as('sol'), 'heists/h1'), { 'cashCollected.sol': 500 }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'heists/h1'), { 'cashCollected.sol': 300 }));
    await assertFails(updateDoc(doc(as('sol2'), 'heists/h1'), { 'cashCollected.sol': 0 }));
    const entry = { dir: 'in', cash: 'dirty', amount: 700, category: 'Heist', note: 'Heist: Fleeca', memberId: null, source: 'heist', ref: 'h1', by: 'boss', byName: 'Boss', at: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as('boss'), 'gangBook/g1'), entry));
    await assertFails(setDoc(doc(as('sol'), 'gangBook/g2'), { ...entry, by: 'sol' }));
    await assertSucceeds(setDoc(doc(as('boss'), 'heists/h1/loot/l1'), { item: 'gold', label: 'Gold bar', qty: 5, assigned: {}, collected: {} }));
    await assertSucceeds(updateDoc(doc(as('boss'), 'heists/h1/loot/l1'), { qty: 3, assigned: { sol: 2 } }));
    await assertFails(updateDoc(doc(as('sol'), 'heists/h1/loot/l1'), { 'collected.sol': 3 }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'heists/h1/loot/l1'), { 'collected.sol': 2 }));
  });
});

describe('associate lockdown', () => {
  const mkAssoc = () => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'members/assoc'), member('Assoc', 'associate')));
  it('lets associates read their own file and the directory, not the family', async () => {
    await mkAssoc();
    await assertSucceeds(getDoc(doc(as('assoc'), 'members/assoc')));
    await assertFails(getDoc(doc(as('assoc'), 'members/sol')));
    await assertFails(getDocs(collection(as('assoc'), 'members')));
    // The directory mirrors members exactly; only soldiers and up keep it in step.
    await assertFails(setDoc(doc(as('sol'), 'directory/sol'), { name: 'Sol', nameLower: 'sol', status: 'active', rankId: 'boss', avatar: null }));
    await assertSucceeds(setDoc(doc(as('sol'), 'directory/sol'), { name: 'Sol', nameLower: 'sol', status: 'active', rankId: 'soldier', avatar: null }));
    await assertFails(setDoc(doc(as('assoc'), 'directory/assoc'), { name: 'Assoc', nameLower: 'assoc', status: 'active', rankId: 'associate', avatar: null }));
    await assertSucceeds(getDocs(collection(as('assoc'), 'directory')));
  });
  it('blocks associates from gang business but keeps their pages working', async () => {
    await mkAssoc();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'blacksites/b1'), { zone: 'Docks' });
      await setDoc(doc(db, 'sheets/sol'), { story: {} });
      await setDoc(doc(db, 'sheets/assoc'), { story: {} });
      await setDoc(doc(db, 'honors/h1'), { name: 'X' });
      await setDoc(doc(db, 'petty/sol'), { rep: 5 });
      await setDoc(doc(db, 'events/e1'), { title: 'Sit-down', scope: 'gang', ranks: [], crewIds: [], owner: 'boss' });
      await setDoc(doc(db, 'events/e2'), { title: 'Associate meet', scope: 'limited', ranks: ['associate'], crewIds: [], owner: 'boss' });
    });
    for (const p of ['blacksites/b1', 'sheets/sol', 'honors/h1', 'events/e1', 'presence/sol', 'stock/main', 'rivals/r1', 'hooks/discord']) await assertFails(getDoc(doc(as('assoc'), p)));
    for (const p of ['sheets/assoc', 'petty/sol', 'events/e2', 'hqRanks/soldier', 'settings/gang']) await assertSucceeds(getDoc(doc(as('assoc'), p)));
    await assertSucceeds(getDoc(doc(as('sol'), 'blacksites/b1')));
    await assertSucceeds(getDoc(doc(as('sol'), 'events/e1')));
  });
});

describe('narco runs', () => {
  const run = (by: string, extra: Record<string, unknown> = {}) => ({ crew: [by], lines: [{ product: 'meth', qty: 5 }], from: 'main', taken: [], cash: 20000, cashGiven: {}, cashCollected: {}, banked: false, postal: '8061', note: '', outcome: 'clean', badNote: '', rivalId: null, by, byName: by, at: serverTimestamp(), ...extra });
  const mkNarco = () => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'roleHolders/sol'), { roles: ['narco'], perms: {}, pages: { narcotics: true }, lead: false }));
  it('keeps runs to Narco and High Table', async () => {
    await mkNarco();
    await assertSucceeds(setDoc(doc(as('sol'), 'narcoRuns/r1'), run('sol')));
    await assertSucceeds(getDoc(doc(as('boss'), 'narcoRuns/r1')));
    await assertFails(getDoc(doc(as('sol2'), 'narcoRuns/r1')));
    await assertFails(setDoc(doc(as('sol2'), 'narcoRuns/r2'), run('sol2')));
    // No pre-handed cash, no logging for someone else.
    await assertFails(setDoc(doc(as('sol'), 'narcoRuns/r3'), run('sol', { cashGiven: { sol: 5 } })));
    await assertFails(setDoc(doc(as('sol'), 'narcoRuns/r4'), run('boss')));
  });
  it('lets the logger fix the record but not the product; leadership splits the cash', async () => {
    await mkNarco();
    await assertSucceeds(setDoc(doc(as('sol'), 'narcoRuns/r1'), run('sol')));
    await assertSucceeds(updateDoc(doc(as('sol'), 'narcoRuns/r1'), { cash: 25000, outcome: 'robbed', badNote: 'Jumped' }));
    await assertFails(updateDoc(doc(as('sol'), 'narcoRuns/r1'), { lines: [{ product: 'meth', qty: 1 }] }));
    await assertFails(updateDoc(doc(as('sol'), 'narcoRuns/r1'), { outcome: 'off' }));
    await assertFails(updateDoc(doc(as('sol'), 'narcoRuns/r1'), { cashGiven: { sol: 25000 } }));
    await assertSucceeds(updateDoc(doc(as('boss'), 'narcoRuns/r1'), { cashGiven: { sol: 10000 } }));
    await assertFails(updateDoc(doc(as('sol'), 'narcoRuns/r1'), { 'cashCollected.sol': 20000 }));
    await assertSucceeds(updateDoc(doc(as('sol'), 'narcoRuns/r1'), { 'cashCollected.sol': 10000 }));
    await assertSucceeds(deleteDoc(doc(as('sol'), 'narcoRuns/r1')));
  });
});
