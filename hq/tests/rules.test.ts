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
    await assertSucceeds(setDoc(doc(as('capo'), 'stock/main'), { meth: 3, ...sign('capo', 'rank') }, { merge: true }));
  });

  it('lets a crew role open the page for a low rank', async () => {
    // sol is a Soldier (no Narcotics by rank) but is in the grow crew, whose role opens it
    await assertSucceeds(setDoc(doc(as('sol'), 'stock/main'), { meth: 3, ...sign('sol', 'grow') }, { merge: true }));
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
      await setDoc(doc(db, 'sales/s1'), { sellerId: 'sol', qty: 1, price: 5000 });
    });
  });
  it('shows sellers only their own sales; the Treasurer sees all', async () => {
    await assertSucceeds(getDoc(doc(as('sol'), 'sales/s1')));
    await assertFails(getDoc(doc(as('sol2'), 'sales/s1')));
    await assertSucceeds(getDoc(doc(as('ub'), 'sales/s1')));
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
  it('lets anyone sync crewIds, but only to crews that really have the member', async () => {
    await assertSucceeds(updateDoc(doc(as('sol'), 'members/sol'), { crewIds: ['grow'] }));
    await assertFails(updateDoc(doc(as('sol2'), 'members/sol2'), { crewIds: ['grow'] }));
    // Dropping a crew they've left is fine.
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
  it('keeps a private loadout to its member and admins; public ones to all', async () => {
    await assertSucceeds(setDoc(doc(as('sol'), 'loadouts/sol'), { public: false, vest: 'ar_class_iii_armor', plates: 3, utility: [] }));
    await assertFails(setDoc(doc(as('sol2'), 'loadouts/sol'), { public: true }));
    await assertFails(getDoc(doc(as('sol2'), 'loadouts/sol')));
    await assertSucceeds(getDoc(doc(as('boss'), 'loadouts/sol')));
    await assertSucceeds(getDoc(doc(as('ub'), 'loadouts/sol')));
    await assertSucceeds(setDoc(doc(as('sol'), 'loadouts/sol'), { public: true }, { merge: true }));
    await assertSucceeds(getDoc(doc(as('sol2'), 'loadouts/sol')));
  });
});

describe('discord hooks', () => {
  it('only Gang settings holders edit the webhooks', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'hqRanks/underboss'), { 'permissions.manageSettings': true }));
    await assertSucceeds(setDoc(doc(as('ub'), 'hooks/discord'), { blacksites: { url: '' } }));
    await assertFails(setDoc(doc(as('sol'), 'hooks/discord'), { blacksites: { url: 'x' } }));
    await assertSucceeds(getDoc(doc(as('sol'), 'hooks/discord')));
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
    // Now an admin: can do officer things, but not touch the Boss.
    await assertSucceeds(setDoc(doc(as('sol'), 'crews/new'), { name: 'New', tag: 'NEW', color: '#fff', leaderId: null, memberIds: [] }));
    await assertFails(updateDoc(doc(as('sol'), 'members/boss'), { status: 'suspended' }));
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
