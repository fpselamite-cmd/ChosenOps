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
  ['caporegime', 'Caporegime', false, { approveMembers: true, resetPins: true, postAnnouncements: true, confirmRep: true, manageOps: true }],
  ['lieutenant', 'Lieutenant', false, { approveMembers: true, confirmRep: true }],
  ['enforcer', 'Enforcer', false, {}],
  ['soldier', 'Soldier', false, {}],
  ['associate', 'Associate', false, {}],
];
const ALL = { approveMembers: true, manageMembers: true, resetPins: true, manageCrews: true, manageRanks: true, manageSettings: true, postAnnouncements: true, confirmRep: true, manageOps: true };
const PAGE_IDS = ['narcotics', 'stash', 'blackmarket', 'blacksites', 'gear', 'pettycrime', 'crews', 'family', 'map', 'calendar'];
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
  await crew('grow', 'Green Room', 'GRN', '#27ae60', 'Marco Gallo', ['Marco Gallo', 'Ghost', 'Jax Holt', 'Kira Lane'], 'Patience pays.', ['narcotics', 'map']);
  await crew('hit', 'Hit Squad', 'HIT', '#c0392b', 'Rocco Vale', ['Rocco Vale', 'Dani Cruz', 'Tommy Reyes', 'Kira Lane', 'Nico Bruno'], 'Hold the hill.', ['map', 'calendar', 'stash']);
  await crew('cook', 'Blue Kitchen', 'BLU', '#2e86de', 'Nico Bruno', ['Nico Bruno', 'Jax Holt', 'Mia Santos'], 'Purity first.', ['narcotics']);
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

  // ---------- Narcotics & Stash ----------
  const sign = { _by: ids['Don Vito'], _via: 'rank' };
  const H = 3600_000;
  const loc = (id, data) => setDoc(doc(db, 'locations', id), { crewId: null, excludeTotals: false, ...data, ...sign });
  await loc('main', { kind: 'stash', name: 'Main Stash', postal: '8021', order: 0, note: 'The vault under the club. Gang-wide.' });
  await loc('basement', { kind: 'stash', name: "Tempest's Basement", postal: '9359', crewId: 'cook', order: 1, note: 'Keep it light in case of raids.' });
  await loc('lockup', { kind: 'stash', name: 'Docks Lockup', postal: '10060', crewId: 'hit', order: 2 });
  const grow = (id, postal, name, crewId, startedHoursAgo, plan, extra = {}) =>
    loc(id, {
      kind: 'grow', postal, name, crewId, durationHours: 36, pots: 10, stashTo: 'main', storage: false, alertSent: startedHoursAgo !== null && startedHoursAgo >= 36,
      startTime: startedHoursAgo === null ? null : Timestamp.fromMillis(now - startedHoursAgo * H), strainPots: plan, order: 10, ...extra,
    });
  await grow('g7078', '7078', 'Leon VW', 'grow', 22, { acapulco: 3, dosidos: 3, gelato41: 2, nl: 2 });
  await grow('g9182', '9182', 'Leon JT', 'grow', 37, { skunk1: 4, ogkush: 3, rainbow: 3 });
  await grow('g10060', '10060', 'Benny Docks', null, null, {});
  await grow('g9043', '9043', 'Jay 1', 'grow', 7, { lemonskunk: 5, columbian: 5 }, { storage: true });
  const bud = (bricks, trimmed, untrimmed) => ({ bricks, trimmed, untrimmed });
  await setDoc(doc(db, 'stock', 'main'), {
    acapulco: bud(4, 8750, 2856), columbian: bud(1, 1750, 1290), dosidos: bud(9, 20500, 3894), skunk1: bud(2, 1250, 1649), ogkush: bud(3, 6500, 1356),
    afghani: bud(1, 1250, 1144), rainbow: bud(8, 1750, 1596), nl: bud(3, 18500, 3628), lemonskunk: bud(5, 1750, 1457), gelato41: bud(2, 9500, 2926),
    coca: 6200, cokeSmall: 3, cokeLarge: 1, meth: 4,
    items: { pistol50: 6, carbine: 3, extmag: 8, suppressor: 4, ammo556: 1200, armor: 10, lockpick: 15 },
    ...sign,
  });
  await setDoc(doc(db, 'stock', 'basement'), { meth: 3, coca: 0, items: { pistol50: 2, armor: 4 }, ...sign });
  await setDoc(doc(db, 'stock', 'lockup'), { cokeSmall: 2, items: { carbine: 4, smg: 2, ammo556: 800, extmag: 6 }, nl: bud(2, 0, 0), ...sign });
  await setDoc(doc(db, 'stock', 'g9043'), { lemonskunk: bud(0, 0, 1980), ...sign });
  const types = [
    ['pistol50', 'Pistol .50', 'gun'], ['carbine', 'Carbine Rifle', 'gun'], ['smg', 'SMG', 'gun'], ['extmag', 'Extended Mag', 'attachment'],
    ['suppressor', 'Suppressor', 'attachment'], ['ammo556', '5.56 Rounds', 'ammo'], ['armor', 'Heavy Armor', 'gear'], ['lockpick', 'Lockpick', 'other'],
  ];
  for (const [id, name, category] of types) await setDoc(doc(db, 'itemTypes', id), { name, category, ...sign });
  await setDoc(doc(db, 'supplies', 'lab'), { sodium: 14, ammonia: 6, soda: 40, water: 36, bags: 22, hammers: 5, oil: 12, cement: 30, acid: 8, ...sign });
  await setDoc(doc(db, 'settings', 'narcotics'), { supplyLow: { ammonia: 10, acid: 20 }, ...sign });
  const cook = (id, who, size, minsAgo, mins) =>
    setDoc(doc(db, 'cooks', id), { by: who, size, mins, at: Timestamp.fromMillis(now - minsAgo * 60_000), done: false, told: minsAgo >= mins, ...sign });
  await cook('k1', 'Nico Bruno', 5, 22 * 60, 24 * 60);
  await cook('k2', 'Jax Holt', 5, 6 * 60, 24 * 60);
  await cook('k3', 'Mia Santos', 3, 25 * 60, 24 * 60);
  await setDoc(doc(db, 'runs', 'r1'), { by: 'Rocco Vale', crew: 'Rocco, Dani', size: 'small', n: 2, mins: 240, at: Timestamp.fromMillis(now - 95 * 60_000), done: false, told: false, ...sign });
  const fmtDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  const made = [3, 0, 5, 2, 7, 1, 0, 4, 6, 2, 3, 8, 1, 2];
  for (let i = 0; i < 14; i++)
    await setDoc(doc(db, 'history', fmtDay(now - i * 86400_000)), { bricksMade: made[i], cokeMade: i % 4 === 0 ? 2 : 0, methMade: i % 3 === 0 ? 1 : 0, ...sign });
  await setDoc(doc(db, 'yields', 'dosidos'), { samples: [{ buds: 640, pots: 3, at: now - 3 * 86400_000 }, { buds: 590, pots: 3, at: now - 6 * 86400_000 }], ...sign });
  const acts = [
    ['Marco Gallo', 'harvest', 50], ['Nico Bruno', 'cook', 40], ['Rocco Vale', 'run', 95], ['Jax Holt', 'buds', 12], ['ChosenOps', 'ready', 30], ['Mia Santos', 'supply', 3],
  ];
  const KINDS = {
    harvest: ['harvested', 'a location', ''], cook: ['put', 'a meth cook', 'down'], run: ['started', 'a coke run', ''], buds: ['updated', 'bud counts', 'in a location'],
    ready: ['', 'A grow', 'is ready to harvest'], supply: ['updated', 'the lab supplies', ''],
  };
  for (const [i, [who, kind, minsAgo]] of acts.entries())
    await setDoc(doc(db, 'activity', `a${i}`), { who, kind, pre: KINDS[kind][0], hi: KINDS[kind][1], post: KINDS[kind][2], at: Timestamp.fromMillis(now - minsAgo * 60_000), ...sign });

  await setDoc(doc(db, 'settings/gang'), { name: 'The Chosen', motto: 'Chosen by blood. Bound in gold.' });
  await setDoc(doc(db, 'settings/announcement'), {
    text: 'Blacksite at the docks Friday 9PM ET. Hit Squad leads, everyone else on standby. Bring armor.',
    by: ids['Don Vito'],
    at: Timestamp.fromMillis(now - 2 * 3600_000),
  });
});
await env.cleanup();
console.log(`Seeded ${PEOPLE.length + 1} members and 4 crews. Sign in as "Don Vito" / ${PIN}.`);
