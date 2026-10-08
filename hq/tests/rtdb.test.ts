import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { get, push, ref, remove, set, update } from 'firebase/database';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

// NoelOps' data in the HQ's own Realtime Database: who gets in comes from the access list that
// leadership's HQ pages keep in step with ranks and the Narco role.
let env: RulesTestEnvironment;
const ACCESS = {
  lead: { m: 'lead', n: 'Lead', lvl: 'manage' },
  narco: { m: 'narco', n: 'Narco', lvl: 'edit' },
  soldier: { m: 'soldier', n: 'Soldier', lvl: 'member' },
  opsguy: { m: 'opsguy', n: 'Ops Guy', lvl: 'member', ops: true },
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-chosenops',
    database: { rules: readFileSync('database.rules.json', 'utf8'), host: '127.0.0.1', port: 9000 },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.database();
    await set(ref(db), {
      access: ACCESS,
      private: { webhookUrl: 'https://discord.example/hook' },
      noelops: {
        stock: { '%stash': { meth: 4 } },
        locations: { '1234': { id: '1234', pots: 6, startTime: null } },
        stashes: { h1: { name: 'Cabin' } },
        settings: { mainStash: { name: 'Main Stash' }, fx: { on: true } },
        stats: { 'name:Narco': { harvests: 3 } },
        crew: { c1: { name: 'Narco' } },
        hq: { members: { narco: { name: 'Narco' } } },
      },
    });
  });
});

const as = (uid: string | null) => (uid ? env.authenticatedContext(uid).database() : env.unauthenticatedContext().database());

describe('NoelOps database', () => {
  it('keeps everything from people who are not signed in or not on the list', async () => {
    await assertFails(get(ref(as(null), 'noelops')));
    await assertFails(get(ref(as(null), 'noelops/stashes')));
    await assertFails(get(ref(as('stranger'), 'noelops/stashes')));
    await assertFails(set(ref(as('stranger'), 'noelops/stock/%stash/meth'), 99));
    await assertFails(set(ref(as('stranger'), 'access/stranger'), { m: 'stranger', n: 'Me', lvl: 'manage' }));
  });
  it('lets a blooded member see stash houses, the Main Stash name and stats, but no drugs', async () => {
    const db = as('soldier');
    await assertSucceeds(get(ref(db, 'noelops/stashes')));
    await assertSucceeds(get(ref(db, 'noelops/settings/mainStash')));
    await assertSucceeds(get(ref(db, 'noelops/stats')));
    await assertSucceeds(get(ref(db, 'access/soldier')));
    await assertFails(get(ref(db, 'noelops')));
    await assertFails(get(ref(db, 'noelops/stock')));
    await assertFails(get(ref(db, 'noelops/locations')));
    await assertFails(set(ref(db, 'noelops/stock/%stash/meth'), 0));
    await assertFails(get(ref(db, 'access/narco')));
  });
  it('lets someone with Manage ops add and rename stash houses', async () => {
    await assertSucceeds(update(ref(as('opsguy'), 'noelops/stashes/h2'), { name: 'Barn' }));
    await assertSucceeds(update(ref(as('opsguy'), 'noelops/settings/mainStash'), { name: 'The Vault' }));
    await assertFails(get(ref(as('opsguy'), 'noelops/stock')));
  });
  it('lets Narco run the ops but not the settings, places or access list', async () => {
    const db = as('narco');
    await assertSucceeds(get(ref(db, 'noelops')));
    await assertSucceeds(set(ref(db, 'noelops/stock/%stash/meth'), 5));
    await assertSucceeds(update(ref(db, 'noelops/locations/1234'), { startTime: 1000 }));
    await assertSucceeds(set(ref(db, 'noelops/settings/supplyLow/acid'), 3));
    await assertSucceeds(push(ref(db, 'noelops/activity'), { who: 'Narco', ts: 1 }));
    await assertSucceeds(push(ref(db, 'outbox'), { body: '{"content":"Harvest ready"}', ts: 1 }));
    await assertFails(set(ref(db, 'noelops/locations/5555'), { id: '5555', pots: 2 }));
    await assertFails(remove(ref(db, 'noelops/locations/1234')));
    await assertFails(set(ref(db, 'noelops/settings/fx'), { on: false }));
    await assertFails(set(ref(db, 'noelops/crew/c2'), { name: 'Sneaky' }));
    await assertFails(get(ref(db, 'private')));
    await assertFails(get(ref(db, 'outbox')));
    await assertFails(update(ref(db, 'access/narco'), { lvl: 'manage' }));
  });
  it('lets leadership manage everything, keep the access list and send the Discord queue', async () => {
    const db = as('lead');
    await assertSucceeds(set(ref(db, 'noelops/locations/5555'), { id: '5555', pots: 2 }));
    await assertSucceeds(remove(ref(db, 'noelops/locations/1234')));
    await assertSucceeds(set(ref(db, 'noelops/settings/fx'), { on: false }));
    await assertSucceeds(get(ref(db, 'private/webhookUrl')));
    await assertSucceeds(set(ref(db, 'access/newbie'), { m: 'newbie', n: 'Newbie', lvl: 'edit' }));
    await assertFails(set(ref(db, 'access/bad'), { m: 'bad', n: 'Bad', lvl: 'god' }));
    const msg = push(ref(as('narco'), 'outbox'));
    await assertSucceeds(set(msg, { body: 'x', ts: 1 }));
    await assertSucceeds(get(ref(db, 'outbox')));
    await assertSucceeds(remove(ref(db, `outbox/${msg.key}`)));
  });
});
