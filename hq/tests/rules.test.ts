import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { arrayRemove, arrayUnion, deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
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
    for (const [id, order, permissions] of RANKS) await setDoc(doc(db, 'ranks', id), { name: id, order, permissions });
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
    batch.set(doc(db, 'ranks/newrank'), { name: 'Boss2', order: 0, permissions: {} });
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
    await assertSucceeds(updateDoc(doc(as('ub'), 'ranks/soldier'), { name: 'Soldato' }));
    await assertFails(updateDoc(doc(as('ub'), 'ranks/underboss'), { name: 'Me' }));
    await assertFails(updateDoc(doc(as('ub'), 'ranks/capo'), { order: 0 }));
    await assertFails(updateDoc(doc(as('capo'), 'ranks/soldier'), { name: 'x' }));
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
