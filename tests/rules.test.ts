import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch, deleteDoc, addDoc, collection } from 'firebase/firestore';
import { DEFAULT_RANKS } from '../src/lib/types';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-chosen',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const user = (uid: string, rankId: string | null, status = 'active') => ({
  username: uid,
  usernameLower: uid.toLowerCase(),
  status,
  rankId,
  reportsTo: null,
  character: {},
  avatar: null,
});

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'meta/bootstrap'), { uid: 'boss' });
    for (const [order, r] of DEFAULT_RANKS.entries()) {
      const { id, ...rest } = r;
      await setDoc(doc(db, 'ranks', id), { ...rest, order });
    }
    await setDoc(doc(db, 'users/boss'), user('boss', 'head'));
    await setDoc(doc(db, 'users/consig'), user('consig', 'consigliere'));
    await setDoc(doc(db, 'users/lt'), user('lt', 'lieutenant'));
    await setDoc(doc(db, 'users/assoc'), user('assoc', 'associate'));
    await setDoc(doc(db, 'users/prospect'), user('prospect', 'prospect'));
    await setDoc(doc(db, 'users/newbie'), user('newbie', null, 'pending'));
    await setDoc(doc(db, 'settings/family'), { announcement: 'hi', inventoryCategories: [], transactionCategories: [] });
    await setDoc(doc(db, 'settings/branding'), { name: 'The Chosen', motto: '', logo: null });
  });
}
const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe('bootstrap', () => {
  it('first user can found the family with seeded ranks', async () => {
    const db = as('founder');
    const b = writeBatch(db);
    b.set(doc(db, 'meta/bootstrap'), { uid: 'founder' });
    DEFAULT_RANKS.forEach((r, order) => {
      const { id, ...rest } = r;
      b.set(doc(db, 'ranks', id), { ...rest, order });
    });
    b.set(doc(db, 'users/founder'), user('founder', 'head'));
    b.set(doc(db, 'usernames/founder'), { uid: 'founder' });
    b.set(doc(db, 'settings/branding'), { name: 'x', motto: '', logo: null });
    b.set(doc(db, 'settings/family'), { announcement: '', inventoryCategories: [], transactionCategories: [] });
    await assertSucceeds(b.commit());
  });

  it('later users cannot self-activate', async () => {
    await seed();
    const db = as('sneaky');
    await assertFails(setDoc(doc(db, 'users/sneaky'), user('sneaky', 'head')));
    await assertFails(setDoc(doc(db, 'ranks/fake'), { name: 'x', order: 0, permissions: {} }));
    const b = writeBatch(db);
    b.set(doc(db, 'users/sneaky'), user('sneaky', null, 'pending'));
    b.set(doc(db, 'usernames/sneaky'), { uid: 'sneaky' });
    await assertSucceeds(b.commit());
  });

  it('cannot claim a taken username', async () => {
    await seed();
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'usernames/boss'), { uid: 'boss' }));
    const db = as('imposter');
    const b = writeBatch(db);
    b.set(doc(db, 'users/imposter'), { ...user('boss', null, 'pending') });
    b.set(doc(db, 'usernames/boss'), { uid: 'imposter' });
    await assertFails(b.commit());
  });
});

describe('members', () => {
  beforeEach(seed);

  it('pending users only see themselves', async () => {
    await assertSucceeds(getDoc(doc(as('newbie'), 'users/newbie')));
    await assertFails(getDoc(doc(as('newbie'), 'users/boss')));
    await assertFails(getDoc(doc(as('newbie'), 'inventory/x')));
  });

  it('members edit their own sheet but cannot self-promote', async () => {
    await assertSucceeds(updateDoc(doc(as('assoc'), 'users/assoc'), { character: { characterName: 'Vinnie' } }));
    await assertFails(updateDoc(doc(as('assoc'), 'users/assoc'), { rankId: 'head' }));
    await assertFails(updateDoc(doc(as('assoc'), 'users/prospect'), { character: { characterName: 'x' } }));
  });

  it('lieutenant can approve pending into lower rank only', async () => {
    await assertFails(updateDoc(doc(as('lt'), 'users/newbie'), { status: 'active', rankId: 'lieutenant' }));
    await assertSucceeds(updateDoc(doc(as('lt'), 'users/newbie'), { status: 'active', rankId: 'prospect' }));
    // Lieutenant lacks manageMembers, so can't then promote them
    await assertFails(updateDoc(doc(as('lt'), 'users/newbie'), { rankId: 'enforcer' }));
  });

  it('consigliere manages those below, not above', async () => {
    await assertSucceeds(updateDoc(doc(as('consig'), 'users/assoc'), { rankId: 'enforcer' }));
    await assertFails(updateDoc(doc(as('consig'), 'users/assoc'), { rankId: 'underboss' }));
    await assertFails(updateDoc(doc(as('consig'), 'users/boss'), { status: 'suspended' }));
    await assertSucceeds(updateDoc(doc(as('consig'), 'users/prospect'), { status: 'suspended' }));
  });

  it('suspended members lose access', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'users/assoc'), { status: 'suspended' }));
    await assertFails(getDoc(doc(as('assoc'), 'users/boss')));
  });
});

describe('ranks', () => {
  beforeEach(seed);

  it('only lower ranks can be edited', async () => {
    await assertSucceeds(updateDoc(doc(as('boss'), 'ranks/prospect'), { name: 'Recruit' }));
    await assertSucceeds(updateDoc(doc(as('boss'), 'ranks/head'), { name: 'The Don' }));
    await assertFails(updateDoc(doc(as('boss'), 'ranks/head'), { order: 3 }));
    await assertFails(updateDoc(doc(as('consig'), 'ranks/prospect'), { name: 'x' }));
    await assertFails(updateDoc(doc(as('boss'), 'ranks/prospect'), { order: 0 }));
    await assertSucceeds(setDoc(doc(as('boss'), 'ranks/new'), { name: 'Capo', order: 7, permissions: {} }));
    await assertSucceeds(deleteDoc(doc(as('boss'), 'ranks/new')));
  });
});

describe('budget & inventory', () => {
  beforeEach(seed);
  const tx = (uid: string) => ({ type: 'dirty', amount: 500, reason: 'job', createdBy: uid });
  const item = (uid: string) => ({ name: 'Pistol', category: 'Weapons', quantity: 2, unitCost: 100, costType: 'dirty', addedBy: uid });

  it('budget visibility and editing follow permissions', async () => {
    await assertSucceeds(getDoc(doc(as('assoc'), 'transactions/x')));
    await assertFails(getDoc(doc(as('prospect'), 'transactions/x')));
    await assertFails(addDoc(collection(as('assoc'), 'transactions'), tx('assoc')));
    await assertSucceeds(addDoc(collection(as('consig'), 'transactions'), tx('consig')));
    await assertFails(addDoc(collection(as('consig'), 'transactions'), { ...tx('consig'), type: 'gold' }));
  });

  it('inventory editing follows permissions', async () => {
    await assertSucceeds(getDoc(doc(as('prospect'), 'inventory/x')));
    await assertFails(addDoc(collection(as('assoc'), 'inventory'), item('assoc')));
    await assertSucceeds(addDoc(collection(as('lt'), 'inventory'), item('lt')));
  });

  it('announcements vs settings', async () => {
    await assertSucceeds(updateDoc(doc(as('lt'), 'settings/family'), { announcement: 'Meeting at 9' }));
    await assertFails(updateDoc(doc(as('lt'), 'settings/family'), { inventoryCategories: ['x'] }));
    await assertFails(updateDoc(doc(as('lt'), 'settings/branding'), { name: 'x' }));
    await assertSucceeds(updateDoc(doc(as('boss'), 'settings/branding'), { name: 'The Chosen Few' }));
  });
});
