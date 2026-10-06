// Fills the LOCAL emulators with a sample family so the HQ can be tried out.
// Usage: npm run emulators   (terminal 1)
//        npm run seed:demo   (terminal 2), then npm run dev:emu and sign in as "Don Vito" / PIN 1234.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp } from 'firebase/firestore';

const PROJECT = 'demo-chosenops';
const AUTH = 'http://127.0.0.1:9099';
const PIN = '1234';

const RANKS = [
  ['boss', 'Boss', true, null],
  ['consigliere', 'Consigliere', true, 'all'],
  ['underboss', 'Underboss', true, 'all'],
  ['treasurer', 'Treasurer', true, { approveMembers: true, postAnnouncements: true, confirmRep: true }],
  ['caporegime', 'Caporegime', false, { approveMembers: true, resetPins: true, postAnnouncements: true, confirmRep: true }],
  ['lieutenant', 'Lieutenant', false, { approveMembers: true, confirmRep: true }],
  ['enforcer', 'Enforcer', false, {}],
  ['soldier', 'Soldier', false, {}],
  ['associate', 'Associate', false, {}],
];
const ALL = { approveMembers: true, manageMembers: true, resetPins: true, manageCrews: true, manageRanks: true, manageSettings: true, postAnnouncements: true, confirmRep: true };
const PAGE_IDS = ['stash', 'timers', 'meth', 'coke', 'blackmarket', 'blacksites', 'gear', 'pettycrime', 'crews', 'family', 'map', 'calendar'];
const pages = (ids) => Object.fromEntries(ids.map((p) => [p, true]));
const BASIC = pages(['blacksites', 'gear', 'pettycrime', 'crews', 'family']);

// [name, rank, reportsTo, online status or null, alias]
const PEOPLE = [
  ['Don Vito', 'boss', null, 'Busy', 'The Don'],
  ['Sal Moretti', 'consigliere', 'Don Vito', null, 'Counsel'],
  ['Nico Bruno', 'underboss', 'Don Vito', 'At the lab', ''],
  ['Lena Russo', 'treasurer', 'Don Vito', 'Selling', 'Ledger'],
  ['Marco Gallo', 'caporegime', 'Nico Bruno', 'Growing', ''],
  ['Rocco Vale', 'caporegime', 'Nico Bruno', 'At a blacksite', 'Hammer'],
  ['Dani Cruz', 'lieutenant', 'Rocco Vale', 'At a blacksite', ''],
  ['Tommy Reyes', 'enforcer', 'Rocco Vale', null, 'Tank'],
  ['Kira Lane', 'soldier', 'Dani Cruz', 'On a run', ''],
  ['Ghost', 'soldier', 'Marco Gallo', null, ''],
  ['Jax Holt', 'associate', 'Marco Gallo', 'Growing', ''],
  ['Mia Santos', 'associate', 'Lena Russo', null, ''],
];

const key = (n) => n.trim().toLowerCase().replace(/\s+/g, '_');

async function signUp(name) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${key(name)}@hq.chosenops.app`, password: `chosenops:${PIN}`, returnSecureToken: true }),
  });
  const body = await res.json();
  if (!body.localId) throw new Error(`signUp ${name}: ${JSON.stringify(body)}`);
  return body.localId;
}

await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080 } });
await env.clearFirestore();

const ids = {};
for (const [name] of PEOPLE) ids[name] = await signUp(name);
ids['Fresh Face'] = await signUp('Fresh Face');

const now = Date.now();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'meta/hqFounding'), { uid: ids['Don Vito'], at: Timestamp.now() });
  for (const [i, [id, name, leadership, perms]] of RANKS.entries())
    await setDoc(doc(db, 'ranks', id), {
      name,
      order: i,
      leadership,
      permissions: perms === 'all' || perms === null ? ALL : perms,
      pages: i <= 5 ? pages(PAGE_IDS) : BASIC,
    });
  for (const [i, [name, rankId, boss, status, alias]] of PEOPLE.entries()) {
    const id = ids[name];
    await setDoc(doc(db, 'members', id), {
      name,
      nameLower: key(name),
      status: 'active',
      rankId,
      reportsTo: boss ? ids[boss] : null,
      avatar: null,
      alias,
      joinedAt: Timestamp.fromMillis(now - (PEOPLE.length - i) * 86400_000 * 3),
    });
    await setDoc(doc(db, 'names', key(name)), { uid: id, v: 0 });
    await setDoc(doc(db, 'presence', id), {
      at: Timestamp.fromMillis(status ? now : now - (i + 2) * 3600_000),
      ...(status ? { status } : {}),
    });
  }
  await setDoc(doc(db, 'members', ids['Fresh Face']), {
    name: 'Fresh Face', nameLower: 'fresh_face', status: 'pending', rankId: null, reportsTo: null, avatar: null, joinedAt: Timestamp.fromMillis(now - 40 * 60_000),
  });
  await setDoc(doc(db, 'names', 'fresh_face'), { uid: ids['Fresh Face'], v: 0 });

  const crew = (id, name, tag, color, leader, members, motto, unlocks) =>
    setDoc(doc(db, 'crews', id), {
      name, tag, color, motto, emblem: null, leaderId: ids[leader], memberIds: members.map((m) => ids[m]), pages: pages(unlocks), createdAt: Timestamp.now(),
    });
  await crew('grow', 'Green Room', 'GRN', '#27ae60', 'Marco Gallo', ['Marco Gallo', 'Ghost', 'Jax Holt', 'Kira Lane'], 'Patience pays.', ['stash', 'timers', 'map']);
  await crew('hit', 'Hit Squad', 'HIT', '#c0392b', 'Rocco Vale', ['Rocco Vale', 'Dani Cruz', 'Tommy Reyes', 'Kira Lane', 'Nico Bruno'], 'Hold the hill.', ['map', 'calendar']);
  await crew('cook', 'Blue Kitchen', 'BLU', '#2e86de', 'Nico Bruno', ['Nico Bruno', 'Jax Holt', 'Mia Santos'], 'Purity first.', ['meth', 'timers']);
  await crew('money', 'Counting Room', 'CNT', '#d4af37', 'Lena Russo', ['Lena Russo', 'Mia Santos', 'Don Vito'], '', ['blackmarket']);

  // Petty crime
  const REP = { 'Don Vito': 120, 'Rocco Vale': 340, 'Dani Cruz': 210, 'Tommy Reyes': 185, 'Kira Lane': 95, Ghost: 60, 'Jax Holt': 30 };
  for (const [name, rep] of Object.entries(REP)) await setDoc(doc(db, 'petty', ids[name]), { rep });
  const crimes = [
    ['Don Vito', 'Store robbery', 25, 4200, 'Little Seoul 24/7', 5],
    ['Don Vito', 'Car theft', 15, 2800, 'Sultan RS to the chop shop', 26],
    ['Don Vito', 'ATM', 10, 1500, '', 50],
  ];
  for (const [i, [who, crime, rep, cash, notes, hoursAgo]] of crimes.entries())
    await setDoc(doc(db, 'pettyLog', `c${i}`), { memberId: ids[who], crime, rep, cash, notes, at: Timestamp.fromMillis(now - hoursAgo * 3600_000) });
  const transfers = [
    ['Rocco Vale', 200, 'confirmed', 'Nico Bruno', 30],
    ['Dani Cruz', 150, 'confirmed', 'Rocco Vale', 20],
    ['Tommy Reyes', 75, 'confirmed', 'Rocco Vale', 12],
    ['Don Vito', 50, 'confirmed', 'Nico Bruno', 8],
    ['Kira Lane', 40, 'pending', null, 1],
    ['Ghost', 25, 'pending', null, 0.3],
  ];
  for (const [i, [who, amount, status, by, hoursAgo]] of transfers.entries())
    await setDoc(doc(db, 'repTransfers', `t${i}`), {
      memberId: ids[who], amount, status, at: Timestamp.fromMillis(now - hoursAgo * 3600_000),
      ...(by ? { decidedBy: ids[by], decidedAt: Timestamp.fromMillis(now - (hoursAgo - 0.5) * 3600_000) } : {}),
    });
  await setDoc(doc(db, 'stats/familyRep'), { total: 2475 });

  await setDoc(doc(db, 'settings/gang'), { name: 'The Chosen', motto: 'Chosen by blood. Bound in gold.' });
  await setDoc(doc(db, 'settings/announcement'), {
    text: 'Blacksite at the docks Friday 9PM ET. Hit Squad leads, everyone else on standby. Bring armor.',
    by: ids['Don Vito'],
    at: Timestamp.fromMillis(now - 2 * 3600_000),
  });
});
await env.cleanup();
console.log(`Seeded ${PEOPLE.length + 1} members and 4 crews. Sign in as "Don Vito" / ${PIN}.`);
