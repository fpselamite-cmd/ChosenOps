import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { createHash } from 'node:crypto';
import { doc, getDoc, setDoc, updateDoc, writeBatch, deleteDoc, addDoc, collection, Timestamp } from 'firebase/firestore';
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
    await setDoc(doc(db, 'settings/family'), { announcement: 'hi', loreCategories: [] });
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
    b.set(doc(db, 'settings/family'), { announcement: '', loreCategories: [] });
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
    await assertFails(getDoc(doc(as('newbie'), 'lore/x')));
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

describe('settings', () => {
  beforeEach(seed);
  it('announcements vs settings', async () => {
    await assertSucceeds(updateDoc(doc(as('lt'), 'settings/family'), { announcement: 'Meeting at 9' }));
    await assertFails(updateDoc(doc(as('lt'), 'settings/family'), { loreCategories: ['x'] }));
    await assertFails(updateDoc(doc(as('lt'), 'settings/branding'), { name: 'x' }));
    await assertSucceeds(updateDoc(doc(as('boss'), 'settings/branding'), { name: 'The Chosen Few' }));
  });
  it('old budget and inventory collections are closed', async () => {
    await assertFails(getDoc(doc(as('boss'), 'transactions/x')));
    await assertFails(setDoc(doc(as('boss'), 'inventory/x'), { name: 'x' }));
  });
});

describe('lore', () => {
  beforeEach(seed);
  const entry = (authorId: string, extra = {}) => ({
    title: 'The Founding',
    category: 'Family History',
    summary: 'How it began.',
    body: 'It began in the rain. [[The Docks]] @boss',
    characters: ['boss'],
    canon: false,
    thumb: null,
    authorId,
    ...extra,
  });

  it('members write their own entries; pending members cannot read', async () => {
    await assertSucceeds(setDoc(doc(as('prospect'), 'lore/a'), entry('prospect')));
    await assertFails(setDoc(doc(as('prospect'), 'lore/b'), entry('boss'))); // impersonation
    await assertFails(setDoc(doc(as('prospect'), 'lore/c'), entry('prospect', { canon: true })));
    await assertFails(getDoc(doc(as('newbie'), 'lore/a')));
    await assertSucceeds(getDoc(doc(as('assoc'), 'lore/a')));
  });

  it('authors edit their own; curators edit anyone and set canon', async () => {
    await setDoc(doc(as('assoc'), 'lore/a'), entry('assoc'));
    await assertSucceeds(updateDoc(doc(as('assoc'), 'lore/a'), { body: 'Rewritten' }));
    await assertFails(updateDoc(doc(as('assoc'), 'lore/a'), { canon: true }));
    await assertFails(updateDoc(doc(as('prospect'), 'lore/a'), { body: 'Vandalism' }));
    await assertFails(deleteDoc(doc(as('prospect'), 'lore/a')));
    await assertSucceeds(updateDoc(doc(as('lt'), 'lore/a'), { canon: true, body: 'Edited by curator' }));
    await assertFails(updateDoc(doc(as('lt'), 'lore/a'), { authorId: 'lt' }));
    await assertSucceeds(deleteDoc(doc(as('lt'), 'lore/a')));
  });

  it('validates sizes and shapes', async () => {
    await assertFails(setDoc(doc(as('assoc'), 'lore/a'), entry('assoc', { title: 'x'.repeat(200) })));
    await assertFails(setDoc(doc(as('assoc'), 'lore/a'), entry('assoc', { body: 'x'.repeat(60001) })));
    await assertFails(setDoc(doc(as('assoc'), 'lore/a'), entry('assoc', { characters: 'boss' })));
  });

  it('cover images follow the article author', async () => {
    const db = as('assoc');
    const b = writeBatch(db);
    b.set(doc(db, 'lore/a'), entry('assoc'));
    b.set(doc(db, 'loreCovers/a'), { image: 'data:image/webp;base64,AAAA' });
    await assertSucceeds(b.commit());
    await assertFails(setDoc(doc(as('prospect'), 'loreCovers/a'), { image: 'x' }));
    await assertSucceeds(setDoc(doc(as('lt'), 'loreCovers/a'), { image: 'y' }));
    const d = writeBatch(db);
    d.delete(doc(db, 'lore/a'));
    d.delete(doc(db, 'loreCovers/a'));
    await assertSucceeds(d.commit());
  });

  it('writeLore is on by default for ranks that predate it, and can be switched off', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'ranks/associate'), { name: 'Associate', order: 5, permissions: { viewBudget: true } });
      await setDoc(doc(ctx.firestore(), 'ranks/prospect'), { name: 'Prospect', order: 6, permissions: { writeLore: false } });
    });
    await assertSucceeds(setDoc(doc(as('assoc'), 'lore/a'), entry('assoc')));
    await assertFails(setDoc(doc(as('prospect'), 'lore/b'), entry('prospect')));
    await assertSucceeds(addDoc(collection(as('prospect'), 'journals'), { authorId: 'prospect', title: 'Still mine', body: '...' }));
  });
});

describe('chronicle', () => {
  beforeEach(seed);
  const ev = (authorId: string, extra = {}) => ({ title: 'The Docks War', when: '1923-03-14', whenLabel: 'Spring, 1923', description: '', characters: [], loreId: null, authorId, ...extra });

  it('follows the same author/curator pattern and checks dates', async () => {
    await assertSucceeds(setDoc(doc(as('assoc'), 'chronicle/a'), ev('assoc')));
    await assertSucceeds(setDoc(doc(as('assoc'), 'chronicle/old'), ev('assoc', { when: '-0300-01-01' })));
    await assertFails(setDoc(doc(as('assoc'), 'chronicle/b'), ev('assoc', { when: 'last tuesday' })));
    await assertFails(updateDoc(doc(as('prospect'), 'chronicle/a'), { title: 'x' }));
    await assertSucceeds(updateDoc(doc(as('assoc'), 'chronicle/a'), { title: 'The Docks War (revised)' }));
    await assertSucceeds(deleteDoc(doc(as('lt'), 'chronicle/a')));
  });
});

describe('journals', () => {
  beforeEach(seed);
  it('only the author writes; curators may remove', async () => {
    await assertSucceeds(setDoc(doc(as('assoc'), 'journals/a'), { authorId: 'assoc', title: 'Day one', body: 'Rain again.' }));
    await assertFails(setDoc(doc(as('assoc'), 'journals/b'), { authorId: 'boss', title: 'Forged', body: '...' }));
    await assertFails(updateDoc(doc(as('lt'), 'journals/a'), { body: 'Edited by someone else' }));
    await assertSucceeds(updateDoc(doc(as('assoc'), 'journals/a'), { body: 'Rain, still.' }));
    await assertFails(getDoc(doc(as('newbie'), 'journals/a')));
    await assertSucceeds(deleteDoc(doc(as('lt'), 'journals/a')));
  });
});

describe('relationships', () => {
  beforeEach(seed);
  const tie = (a: string, b: string, createdBy: string, type = 'sibling') => ({ a, b, type, note: '', createdBy });

  it('members add and remove ties that involve themselves', async () => {
    await assertSucceeds(setDoc(doc(as('assoc'), 'relationships/a'), tie('assoc', 'prospect', 'assoc')));
    await assertFails(setDoc(doc(as('assoc'), 'relationships/b'), tie('boss', 'prospect', 'assoc')));
    await assertFails(setDoc(doc(as('assoc'), 'relationships/c'), tie('assoc', 'assoc', 'assoc')));
    await assertFails(setDoc(doc(as('assoc'), 'relationships/d'), tie('assoc', 'boss', 'assoc', 'lover')));
    await assertFails(updateDoc(doc(as('assoc'), 'relationships/a'), { type: 'enemy' }));
    await assertSucceeds(deleteDoc(doc(as('prospect'), 'relationships/a')));
  });

  it('curators manage anyone’s ties', async () => {
    await assertSucceeds(setDoc(doc(as('lt'), 'relationships/a'), tie('boss', 'prospect', 'lt', 'parent')));
    await assertFails(deleteDoc(doc(as('assoc'), 'relationships/a')));
    await assertSucceeds(deleteDoc(doc(as('lt'), 'relationships/a')));
  });
});

describe('PIN reset codes', () => {
  beforeEach(seed);
  const hash = (code: string) => createHash('sha256').update(code).digest('hex');
  const inHours = (h: number) => Timestamp.fromMillis(Date.now() + h * 3600_000);
  const issue = (by: string, target: string, code = 'ABCD2345', expiresAt = inHours(24)) =>
    setDoc(doc(as(by), 'pinResets', target), { codeHash: hash(code), by, expiresAt });

  async function redeem(newAuth: string, memberId: string, code: string, v = 1) {
    const db = as(newAuth);
    const b = writeBatch(db);
    b.set(doc(db, 'authLinks', newAuth), { memberId, code });
    b.update(doc(db, 'users', memberId), { authUid: newAuth });
    b.update(doc(db, 'usernames', memberId), { v });
    b.delete(doc(db, 'pinResets', memberId));
    return b.commit();
  }
  beforeEach(() =>
    env.withSecurityRulesDisabled(async (ctx) => {
      for (const u of ['boss', 'consig', 'lt', 'assoc', 'prospect']) await setDoc(doc(ctx.firestore(), 'usernames', u), { uid: u });
    }),
  );

  it('only officers with resetPins can issue codes, for members below them', async () => {
    await assertSucceeds(issue('consig', 'assoc'));
    await assertSucceeds(issue('boss', 'consig'));
    await assertFails(issue('consig', 'boss'));
    await assertFails(issue('lt', 'prospect'));
    await assertFails(issue('assoc', 'assoc'));
    await assertFails(issue('consig', 'assoc', 'X', inHours(24 * 30)));
    await assertFails(getDoc(doc(as('assoc'), 'pinResets/assoc')));
  });

  it('a valid code moves the member to a new sign-in account', async () => {
    await issue('consig', 'assoc');
    await assertSucceeds(redeem('assoc2', 'assoc', 'ABCD2345'));
    // New account acts as the member
    await assertSucceeds(getDoc(doc(as('assoc2'), 'users/boss')));
    await assertSucceeds(updateDoc(doc(as('assoc2'), 'users/assoc'), { character: { characterName: 'New Me' } }));
    await assertSucceeds(getDoc(doc(as('assoc2'), 'lore/x')));
    // Old account (old PIN) is locked out
    await assertFails(getDoc(doc(as('assoc'), 'users/boss')));
    await assertFails(updateDoc(doc(as('assoc'), 'users/assoc'), { character: {} }));
    // Code is single use
    await assertFails(redeem('assoc3', 'assoc', 'ABCD2345', 2));
  });

  it('second reset works from a linked account too', async () => {
    await issue('consig', 'assoc');
    await redeem('assoc2', 'assoc', 'ABCD2345');
    await issue('consig', 'assoc', 'ZZZZ9999');
    await assertSucceeds(redeem('assoc3', 'assoc', 'ZZZZ9999', 2));
    await assertFails(getDoc(doc(as('assoc2'), 'users/boss')));
    await assertSucceeds(getDoc(doc(as('assoc3'), 'users/boss')));
  });

  it('linked officers keep their powers', async () => {
    await issue('boss', 'consig');
    await redeem('consig2', 'consig', 'ABCD2345');
    const lore = (authorId: string) => ({ title: 'T', category: 'Legends', body: 'b', characters: [], canon: false, authorId });
    await assertSucceeds(addDoc(collection(as('consig2'), 'lore'), lore('consig')));
    await assertFails(addDoc(collection(as('consig2'), 'lore'), lore('consig2')));
    await assertSucceeds(updateDoc(doc(as('consig2'), 'users/prospect'), { rankId: 'associate' }));
  });

  it('rejects wrong, expired, or missing codes and hijacking attempts', async () => {
    await assertFails(redeem('evil', 'assoc', 'ABCD2345')); // no code issued
    await issue('consig', 'assoc');
    await assertFails(redeem('evil', 'assoc', 'WRONG000'));
    await assertFails(redeem('evil', 'boss', 'ABCD2345')); // code is for someone else
    // Can't take over without the link
    await assertFails(updateDoc(doc(as('evil'), 'users/assoc'), { authUid: 'evil' }));
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'pinResets/prospect'), { codeHash: hash('OLDCODE1'), by: 'boss', expiresAt: inHours(-1) }),
    );
    await assertFails(redeem('evil', 'prospect', 'OLDCODE1'));
  });
});
