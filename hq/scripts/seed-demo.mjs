// Fills the LOCAL emulators with a sample family so the HQ can be tried out.
// Usage: npm run emulators   (terminal 1)
//        npm run seed:demo   (terminal 2), then npm run dev:emu and sign in as "Don Vito" / PIN 1234.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const PROJECT = 'demo-chosenops';
const AUTH = 'http://127.0.0.1:9099';
const PIN = '1234';

const RANKS = [
  ['boss', 'Boss', true, null],
  ['consigliere', 'Consigliere', true, 'all'],
  ['underboss', 'Underboss', true, 'all'],
  ['treasurer', 'Treasurer', true, { approveMembers: true, postAnnouncements: true, confirmRep: true, money: true, awardTrophies: true }],
  ['caporegime', 'Caporegime', false, { approveMembers: true, resetPins: true, postAnnouncements: true, confirmRep: true, manageOps: true }],
  ['lieutenant', 'Lieutenant', false, { approveMembers: true, confirmRep: true }],
  ['enforcer', 'Enforcer', false, {}],
  ['soldier', 'Soldier', false, {}],
  ['associate', 'Associate', false, {}],
];
const ALL = { approveMembers: true, manageMembers: true, resetPins: true, manageCrews: true, manageRanks: true, manageSettings: true, postAnnouncements: true, confirmRep: true, manageOps: true, money: true, awardTrophies: true, familyCards: true };
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
    await setDoc(doc(db, 'hqRanks', id), {
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

  // Crew lists on member files (the app keeps these in sync), birthdays and a couple of old hands.
  const CREWS = { grow: ['Marco Gallo', 'Ghost', 'Jax Holt', 'Kira Lane'], hit: ['Rocco Vale', 'Dani Cruz', 'Tommy Reyes', 'Kira Lane', 'Nico Bruno'], cook: ['Nico Bruno', 'Jax Holt', 'Mia Santos'], money: ['Lena Russo', 'Mia Santos', 'Don Vito'] };
  const BDAYS = { 'Don Vito': '10-18', 'Rocco Vale': '10-09', 'Kira Lane': '10-24', 'Ghost': '11-02', 'Lena Russo': '03-14' };
  const etParts = (ms) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(ms).map((x) => [x.type, +x.value || x.value]));
  for (const [name] of PEOPLE) {
    const patch = { crewIds: Object.entries(CREWS).filter(([, l]) => l.includes(name)).map(([c]) => c).sort() };
    if (BDAYS[name]) patch.birthday = BDAYS[name];
    await setDoc(doc(db, 'members', ids[name]), patch, { merge: true });
  }
  const t0 = etParts(now);
  await setDoc(doc(db, 'members', ids['Don Vito']), { joinedAt: Timestamp.fromMillis(Date.UTC(t0.year - 2, 9, 12, 16)) }, { merge: true });
  await setDoc(doc(db, 'members', ids['Sal Moretti']), { joinedAt: Timestamp.fromMillis(Date.UTC(t0.year - 1, 9, 9, 16)) }, { merge: true });

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
  // Stash houses and grows live in NoelOps; the HQ keeps its extras (crew, postal) and the items.
  await loc('main', { kind: 'stash', name: 'Main Stash', postal: '8021', order: 0 });
  await loc('noel_basement', { kind: 'stash', name: "Tempest's Basement", postal: '9359', crewId: 'cook' });
  await loc('noel_lockup', { kind: 'stash', name: 'Docks Lockup', postal: '10060', crewId: 'hit' });
  for (const g of ['g7078', 'g9182', 'g9043']) await loc(g, { kind: 'grow', name: g, crewId: 'grow' });
  const bud = (bricks, trimmed, untrimmed) => ({ bricks, trimmed, untrimmed });
  await setDoc(doc(db, 'stock', 'main'), {
    items: { g_50_pistol: 6, g_carbine_rifle: 3, w_mk18_rifle: 2, w_m700_rifle: 1, a_block_17_pistol__b17_20rd_extended: 8, a_mk18_rifle__mk18_ta02_acog: 4, ammo_5_56x45mm_box: 6, ammo_5_56x45mm_rnd: 1200, ammo_9x19mm_box: 10, ammo_12_gauge_box: 4, ar_class_iii_armor: 10, ar_armor_plate: 24, s_weapon_repair_kit: 5, m_knife: 3, lockpick: 15 },
    ...sign,
  });
  await setDoc(doc(db, 'stock', 'noel_basement'), { items: { g_50_pistol: 2, ar_class_iii_armor: 4 }, ...sign });
  await setDoc(doc(db, 'stock', 'noel_lockup'), { items: { g_carbine_rifle: 4, g_smg: 2, ammo_5_56x45mm_rnd: 800, a_block_17_pistol__b17_20rd_extended: 6 }, ...sign });

  // NoelOps' own database (the Realtime Database emulator): places, drug stock, cooks and runs.
  const growRec = (id, alias, startedHoursAgo, plan, extra = {}) => ({
    id, alias, durationHours: 36, pots: 10, startTime: startedHoursAgo === null ? null : now - startedHoursAgo * H, harvestAlertSent: false, strainPots: plan, storage: false, stashTo: '%stash', excludeTotals: false, order: 0, ...extra,
  });
  const noel = {
    settings: { mainStash: { name: 'Main Stash', excludeTotals: false } },
    stashes: { basement: { name: "Tempest's Basement", note: 'Keep it light in case of raids.', excludeTotals: false, order: 1 }, lockup: { name: 'Docks Lockup', note: '', excludeTotals: false, order: 2 } },
    locations: {
      7078: growRec('7078', 'Leon VW', 22, { acapulco: 3, dosidos: 3, gelato41: 2, nl: 2 }),
      9182: growRec('9182', 'Leon JT', 37, { skunk1: 4, ogkush: 3, rainbow: 3 }),
      10060: growRec('10060', 'Benny Docks', null, {}),
      9043: growRec('9043', 'Jay 1', 7, { lemonskunk: 5, columbian: 5 }, { storage: true }),
    },
    stock: {
      '%stash': {
        acapulco: bud(4, 8750, 2856), columbian: bud(1, 1750, 1290), dosidos: bud(9, 20500, 3894), skunk1: bud(2, 1250, 1649), ogkush: bud(3, 6500, 1356),
        afghani: bud(1, 1250, 1144), rainbow: bud(8, 1750, 1596), nl: bud(3, 18500, 3628), lemonskunk: bud(5, 1750, 1457), gelato41: bud(2, 9500, 2926),
        coca: 6200, cokeSmall: 3, cokeLarge: 1, meth: 4,
      },
      '%hbasement': { meth: 3, coca: 0 },
      '%hlockup': { cokeSmall: 2, nl: bud(2, 0, 0) },
      9043: { lemonskunk: bud(0, 0, 1980) },
    },
    cooks: { c1: { who: 'Nico Bruno', size: 5, mins: 90, ts: now - 40 * 60000 } },
    runs: { r1: { who: 'Rocco Vale', crew: 'Hit squad', size: 'small', n: 2, mins: 120, ts: now - 30 * 60000 } },
  };
  const RULES = readFileSync(new URL('../noelops.rules.json', import.meta.url), 'utf8');
  await fetch('http://127.0.0.1:9000/.settings/rules.json?ns=noelops-default-rtdb', { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: RULES });
  const rtdb = await fetch('http://127.0.0.1:9000/noelops.json?ns=noelops-default-rtdb', { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(noel) });
  if (!rtdb.ok) throw new Error(`NoelOps emulator: ${rtdb.status} ${await rtdb.text()}`);
  // The family's item catalog (src/data/catalog.json), plus a lockpick that isn't in it.
  const CATALOG = JSON.parse(readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8'));
  for (let i = 0; i < CATALOG.length; i += 400) {
    const b = writeBatch(db);
    CATALOG.slice(i, i + 400).forEach(({ id, ...it }) => b.set(doc(db, 'itemTypes', id), { ...it, ...sign }));
    await b.commit();
  }
  await setDoc(doc(db, 'itemTypes', 'lockpick'), { name: 'Lockpick', category: 'tool', ...sign });
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

  // BlackMarket books
  const D = 86400_000;
  const sales = [
    ['dosidos', 2, 'main', 'Main Stash', 'Lena Russo', 20, 38000, 2], ['meth', 1, 'noel_basement', "Tempest's Basement", 'Nico Bruno', 20, 26000, 5],
    ['cokeSmall', 2, 'noel_lockup', 'Docks Lockup', 'Rocco Vale', 25, 44000, 9], ['nl', 3, 'main', 'Main Stash', 'Marco Gallo', 20, 51000, 20],
    ['acapulco', 1, 'main', 'Main Stash', 'Kira Lane', 15, 17500, 30], ['ogkush', 2, 'main', 'Main Stash', 'Lena Russo', 20, null, 50],
    ['cokeLarge', 1, 'main', 'Main Stash', 'Don Vito', 30, 61000, 70], ['rainbow', 4, 'main', 'Main Stash', 'Marco Gallo', 20, 70000, 26 * 24],
    ['dosidos', 3, 'main', 'Main Stash', 'Kira Lane', 15, 54000, 52 * 24], ['meth', 2, 'noel_basement', "Tempest's Basement", 'Jax Holt', 15, 50000, 75 * 24],
  ];
  for (const [i, [product, qty, from, fromLabel, who, cut, price, hoursAgo]] of sales.entries())
    await setDoc(doc(db, 'sales', `s${i}`), { product, qty, from, fromLabel, sellerId: ids[who], sellerName: who, cut, price, narco: i === 1, note: i === 2 ? 'Pier buyer' : '', byName: who, at: Timestamp.fromMillis(now - hoursAgo * H), ...sign });
  await setDoc(doc(db, 'washes', 'w0'), { memberId: ids['Lena Russo'], memberName: 'Lena Russo', dirty: 30000, pct: 50, clean: 15000, note: 'Laundromat', byName: 'Lena Russo', at: Timestamp.fromMillis(now - 4 * H), ...sign });
  await setDoc(doc(db, 'washes', 'w1'), { memberId: ids['Marco Gallo'], memberName: 'Marco Gallo', dirty: 40000, pct: 50, clean: 20000, note: '', byName: 'Lena Russo', at: Timestamp.fromMillis(now - 2 * D), ...sign });
  await setDoc(doc(db, 'ledger', 'l0'), { type: 'payout', amount: 7600, toId: ids['Lena Russo'], toName: 'Lena Russo', note: 'Weekly cut', byName: 'Lena Russo', at: Timestamp.fromMillis(now - D) });
  await setDoc(doc(db, 'ledger', 'l1'), { type: 'expense', amount: 12000, toId: null, note: 'Lab supplies', byName: 'Lena Russo', at: Timestamp.fromMillis(now - 3 * D) });
  await setDoc(doc(db, 'settings', 'blackmarket'), {
    prices: { dosidos: 19000, nl: 17000, acapulco: 17500, rainbow: 17500, meth: 25000, cokeSmall: 22000, cokeLarge: 61000 },
    defaultCut: 20, cuts: { [ids['Kira Lane']]: 15, [ids['Jax Holt']]: 15, [ids['Rocco Vale']]: 25, [ids['Don Vito']]: 30 }, washPct: 50,
    wishFields: [{ id: 'pay', label: 'Will pay' }],
  });
  await setDoc(doc(db, 'wishes', 'x0'), { title: 'Thermite', qty: 3, notes: 'For the bank job', fields: { pay: '$5k each' }, byId: ids['Rocco Vale'], byName: 'Rocco Vale', status: 'open', claimerId: null, claimerName: null, at: Timestamp.fromMillis(now - 5 * H) });
  await setDoc(doc(db, 'wishes', 'x1'), { title: 'Heavy Armor', qty: 10, notes: '', fields: {}, byId: ids['Dani Cruz'], byName: 'Dani Cruz', status: 'claimed', claimerId: ids['Tommy Reyes'], claimerName: 'Tommy Reyes', at: Timestamp.fromMillis(now - 26 * H) });

  // Don Vito's locker, a sign-out and a trade
  const vito = ids['Don Vito'];
  await setDoc(doc(db, 'lockers', vito), { storages: [{ id: 'onme', name: 'On Me' }, { id: 'home', name: 'Home' }, { id: 'yacht', name: 'The Yacht' }] });
  // A member's own named variant of a catalog item.
  await setDoc(doc(db, 'itemTypes', 'v_pumpkin_bat'), { name: 'Pumpkin Bat', category: 'melee', baseId: 'm_bat', owner: vito, ...sign });
  await setDoc(doc(db, 'lockerStock', `${vito}__onme`), {
    owner: vito,
    items: { w_pn905_pistol: 1, a_pn905_pistol__pn_905_17rd: 2, ar_class_iii_armor: 1, ar_armor_plate: 3, v_pumpkin_bat: 1, lockpick: 3, ammo_9x19mm_box: 1, ammo_9x19mm_rnd: 34, ammo_5_56x45mm_box: 2, ammo_5_56x45mm_rnd: 120 },
    ...sign,
  });
  await setDoc(doc(db, 'lockerStock', `${vito}__home`), {
    owner: vito, dosidos: bud(2, 0, 0), meth: 1,
    items: { g_carbine_rifle: 1, w_mk18_rifle: 1, a_mk18_rifle__mk18_ta02_acog: 1, a_mk18_rifle__mk18_30rd_std: 3, a_mk18_rifle__mk18_m_lok_mvg_black: 1, a_mk18_rifle__mk18_moe_magpul_black: 1, a_mk18_rifle__mk18_dbal_a2: 1, m_switchblade: 1, s_fire_extinguisher: 1, ammo_12_gauge_rnd: 16, k_duffel_bag: 1, t_molotov: 3, t_pipe_bomb: 1, k_tablet: 1, k_medkit: 2, bm_pistol_suppressor: 1 },
    ...sign,
  });
  await setDoc(doc(db, 'lockerStock', `${vito}__yacht`), { owner: vito, cokeLarge: 1, items: { ammo_5_56x45mm_box: 4, ammo_5_56x45mm_rnd: 400, ammo_50_bmg_box: 1, w_m700_rifle: 1 }, ...sign });
  await setDoc(doc(db, 'signouts', 'so0'), { memberId: vito, memberName: 'Don Vito', fromLoc: 'main', fromLabel: 'Main Stash', storageId: 'home', thing: { field: 'meth', item: 'g_carbine_rifle', qty: 1, label: 'Carbine Rifle' }, status: 'out', at: Timestamp.fromMillis(now - 3 * H) });
  await setDoc(doc(db, 'signouts', 'so1'), { memberId: ids['Tommy Reyes'], memberName: 'Tommy Reyes', fromLoc: 'noel_lockup', fromLabel: 'Docks Lockup', storageId: 'onme', thing: { field: 'meth', item: 'g_smg', qty: 1, label: 'SMG' }, status: 'out', at: Timestamp.fromMillis(now - 9 * H) });
  await setDoc(doc(db, 'trades', 'tr0'), { from: ids['Rocco Vale'], fromName: 'Rocco Vale', fromStorage: 'onme', to: vito, toName: 'Don Vito', thing: { field: 'meth', item: 'a_block_17_pistol__b17_20rd_extended', qty: 2, label: 'Extended Mag' }, note: 'For your carbine, boss', status: 'pending', at: Timestamp.fromMillis(now - 40 * 60_000) });

  // Trophies and keepsake cabinets
  await setDoc(doc(db, 'stats', vito), { harvests: 31, pressed: 64, cooks: 7, runs: 4 });
  const trophy = (id, who, t) => setDoc(doc(db, 'trophies', id), { memberId: ids[who], at: Timestamp.fromMillis(now - 2 * D), ...t });
  await trophy(`${vito}_harvester_1`, 'Don Vito', { kind: 'achievement', achId: 'harvester', tier: 1, design: 'leaf', title: 'Harvester I', note: '5 harvests', by: 'achievement' });
  await trophy(`${vito}_harvester_2`, 'Don Vito', { kind: 'achievement', achId: 'harvester', tier: 2, design: 'leaf', title: 'Harvester II', note: '25 harvests', by: 'achievement' });
  await trophy(`${vito}_press_2`, 'Don Vito', { kind: 'achievement', achId: 'press', tier: 2, design: 'brick', title: 'Brick Press II', note: '50 bricks pressed', by: 'achievement' });
  await trophy('aw0', 'Don Vito', { kind: 'award', tier: 4, design: 'crown', title: 'Founder of the Family', note: 'Built The Chosen from nothing.', by: ids['Sal Moretti'], byName: 'Sal Moretti' });
  await trophy('aw1', 'Don Vito', { kind: 'award', tier: 3, design: 'cup', title: 'Docks Blacksite Champion', note: 'Held the docks for 41 minutes.', by: ids['Sal Moretti'], byName: 'Sal Moretti' });
  await trophy('aw2', 'Rocco Vale', { kind: 'award', tier: 3, design: 'crosshair', title: 'Marksman', note: 'Most kills at the docks.', by: vito, byName: 'Don Vito' });
  await setDoc(doc(db, 'cabinets', vito), {
    pedestals: 8,
    slots: {
      0: { kind: 'trophy', trophyId: 'aw0', label: 'Where it all began' },
      1: { kind: 'trophy', trophyId: 'aw1' },
      2: { kind: 'item', itemTypeId: 'v_pumpkin_bat', name: 'Pumpkin Bat (Bat)', label: 'Halloween ’26 event' },
      3: { kind: 'trophy', trophyId: `${vito}_harvester_2` },
      4: { kind: 'keepsake', name: 'Lucky Dice', label: 'From the first card game', image: null },
      5: { kind: 'trophy', trophyId: `${vito}_press_2`, label: '50 bricks, one night' },
    },
  });

  // Monthly leaderboards: past months (already handed out) plus this month from the sales above.
  const ym = (ms) => { const p = etParts(ms); return `${p.year}-${String(p.month).padStart(2, '0')}`; };
  const boards = {};
  const add = (k, b, who, v) => { boards[k] ??= { sales: {}, bricks: {} }; boards[k][b][ids[who]] = (boards[k][b][ids[who]] ?? 0) + v; };
  for (const [, , , , who, , price, hoursAgo] of sales) if (price) add(ym(now - hoursAgo * H), 'sales', who, price);
  const back = (n) => { const p = etParts(now); const d = new Date(Date.UTC(p.year, p.month - 1 - n, 15)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  const PAST = [
    [3, { 'Lena Russo': 182000, 'Marco Gallo': 141000, 'Rocco Vale': 96000, 'Kira Lane': 52000 }, { 'Marco Gallo': 46, 'Jax Holt': 31, Ghost: 22, 'Kira Lane': 9 }],
    [2, { 'Marco Gallo': 214000, 'Lena Russo': 160500, 'Don Vito': 122000, 'Jax Holt': 70000, 'Nico Bruno': 26000 }, { 'Jax Holt': 52, 'Marco Gallo': 49, Ghost: 30 }],
    [1, { 'Rocco Vale': 233000, 'Marco Gallo': 198000, 'Lena Russo': 175000, 'Kira Lane': 88000 }, { 'Marco Gallo': 61, Ghost: 44, 'Jax Holt': 38, 'Kira Lane': 12 }],
  ];
  for (const [n, s, b] of PAST) {
    const k = back(n);
    for (const [who, v] of Object.entries(s)) add(k, 'sales', who, v);
    for (const [who, v] of Object.entries(b)) add(k, 'bricks', who, v);
    boards[k].awarded = true;
    const BD = [['sales', 'Top Seller', 'moneybag', s, (v) => `$${v.toLocaleString('en-US')}`], ['bricks', 'Top Presser', 'brick', b, (v) => `${v} bricks`]];
    for (const [board, title, design, table, unit] of BD)
      for (const [i, [who, v]] of Object.entries(table).sort((a, c) => c[1] - a[1]).slice(0, 3).entries())
        await setDoc(doc(db, 'trophies', `${ids[who]}_top_${board}_${k}`), {
          kind: 'monthly', by: 'leaderboard', board, month: k, place: i + 1, tier: 3 - i, memberId: ids[who], design,
          title: `${title} #${i + 1} · ${new Date(`${k}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`, note: unit(v), at: Timestamp.fromMillis(now - (n - 1) * 30 * D - 5 * D),
        });
  }
  for (const [who, v] of Object.entries({ 'Marco Gallo': 14, 'Jax Holt': 9, Ghost: 6, 'Don Vito': 3 })) add(ym(now), 'bricks', who, v);
  for (const [k, v] of Object.entries(boards)) await setDoc(doc(db, 'boards', k), v);

  // Map pins
  const pin = (id, owner, name, type, x, y, scope, extra = {}) =>
    setDoc(doc(db, 'pins', id), { owner: ids[owner], ownerName: owner, name, type, x, y, scope, ranks: [], crewIds: [], minRank: null, note: '', at: Timestamp.fromMillis(now - 3 * D), ...extra });
  const LEAD = ['boss', 'consigliere', 'underboss', 'treasurer'];
  await pin('p1', 'Marco Gallo', 'Leon VW grow', 'grow', 0.52, 0.71, 'gang', { note: 'Postal 7078. Knock twice.' });
  await pin('p2', 'Marco Gallo', 'Leon JT grow', 'grow', 0.61, 0.66, 'gang', { note: 'Postal 9182' });
  await pin('p3', 'Don Vito', 'Main Stash', 'stash', 0.44, 0.78, 'limited', { ranks: [...LEAD, 'caporegime', 'lieutenant'], minRank: 'lieutenant', note: 'Lieutenant and up only.' });
  await pin('p4', 'Nico Bruno', 'Blue Kitchen lab', 'lab', 0.70, 0.40, 'limited', { ranks: LEAD, crewIds: ['cook'], note: 'Cook crew + leadership.' });
  await pin('p5', 'Rocco Vale', 'Docks blacksite', 'blacksite', 0.38, 0.88, 'gang', { note: 'King of the Hill zone. Friday 9PM.' });
  await pin('p6', 'Rocco Vale', 'Ballas block', 'rival', 0.56, 0.84, 'gang', { note: 'Stay off after dark.' });
  await pin('p7', 'Don Vito', 'Our corner', 'turf', 0.48, 0.74, 'gang');
  await pin('p8', 'Don Vito', 'Pier meet', 'meet', 0.31, 0.80, 'gang', { note: 'Buyers meet here.' });
  await pin('p9', 'Don Vito', 'My safehouse', 'other', 0.66, 0.22, 'personal', { note: 'Only I see this one.' });
  await pin('p10', 'Lena Russo', 'Laundromat', 'shop', 0.53, 0.77, 'limited', { ranks: LEAD, crewIds: ['money'], note: 'Washes at 50%.' });

  // Calendar
  const at = (daysFromNow, h, m = 0) => { const p = etParts(now + daysFromNow * D); return Timestamp.fromMillis(Date.UTC(p.year, p.month - 1, p.day, h + 4, m)); };
  const ev = (id, owner, title, kind, start, mins, repeat, scope, extra = {}) =>
    setDoc(doc(db, 'events', id), { owner: ids[owner], ownerName: owner, title, kind, start, mins, repeat, scope, ranks: [], crewIds: [], minRank: null, place: '', note: '', rsvp: { [ids[owner]]: 'yes' }, ...extra });
  await ev('e1', 'Don Vito', 'Family sit-down', 'meeting', at(-6, 20), 60, 'weekly', 'gang', { place: 'The Yacht', note: 'Weekly. Bring numbers.', rsvp: { [ids['Don Vito']]: 'yes', [ids['Sal Moretti']]: 'yes', [ids['Lena Russo']]: 'yes', [ids['Rocco Vale']]: 'maybe', [ids['Ghost']]: 'no' } });
  await ev('e2', 'Rocco Vale', 'Docks blacksite', 'blacksite', at(3, 21), 120, 'none', 'gang', { place: 'Docks blacksite', note: 'Hit Squad leads, everyone else on standby. Bring armor.', rsvp: { [ids['Rocco Vale']]: 'yes', [ids['Dani Cruz']]: 'yes', [ids['Tommy Reyes']]: 'yes', [ids['Kira Lane']]: 'maybe' } });
  await ev('e3', 'Don Vito', 'Leadership: territory talk', 'meeting', at(1, 19), 60, 'none', 'limited', { ranks: LEAD, note: 'Leadership only.' });
  await ev('e4', 'Marco Gallo', 'Coca leaves harvest', 'op', at(-2, 18), 60, 'weekly', 'limited', { ranks: LEAD, crewIds: ['grow'] });
  await ev('e5', 'Lena Russo', 'Payout day', 'other', at(-5, 17), 30, 'biweekly', 'gang', { place: 'Laundromat' });
  await ev('e6', 'Kira Lane', 'Fleeca job', 'heist', at(8, 22), 90, 'none', 'limited', { ranks: LEAD, crewIds: ['hit'] });
  await ev('e7', 'Mia Santos', 'Rooftop party', 'party', at(10, 23), 240, 'none', 'gang', { place: 'Vinewood rooftop' });

  // Blacksites
  const shot = (title, color) =>
    'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a2230"/><stop offset="1" stop-color="#0a0d12"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><rect x="24" y="24" width="592" height="312" fill="none" stroke="${color}" stroke-opacity=".5" stroke-width="2"/><text x="320" y="170" fill="${color}" font-family="sans-serif" font-size="34" text-anchor="middle">${title}</text><text x="320" y="214" fill="#999" font-family="monospace" font-size="16" text-anchor="middle">sample screenshot</text></svg>`);
  const P = (names) => names.map((n) => ids[n]);
  const st = (k, d, l, b = []) => ({ kills: k, downs: d, logistics: l, brought: b });
  const fight = (id, f) => setDoc(doc(db, 'blacksites', id), { pinId: 'p5', notes: '', closesAt: Timestamp.fromMillis(now - H), stashTo: 'main', lootStatus: 'closed', votes: {}, stats: {}, createdAt: f.at, ...f });
  await fight('bs1', {
    zone: 'Docks blacksite', at: Timestamp.fromMillis(now - 2 * D - 3 * H), result: 'win', rivals: ['Ballas'], holdMins: 41, rep: 250,
    participants: P(['Rocco Vale', 'Dani Cruz', 'Tommy Reyes', 'Kira Lane', 'Don Vito', 'Nico Bruno']),
    stats: { [ids['Rocco Vale']]: st(9, 2, 0), [ids['Dani Cruz']]: st(6, 3, 1, ['meds']), [ids['Tommy Reyes']]: st(4, 4, 0), [ids['Kira Lane']]: st(2, 1, 5, ['ammo', 'plates']), [ids['Don Vito']]: st(3, 0, 0), [ids['Nico Bruno']]: st(1, 2, 3, ['ammo', 'meds']) },
    votes: { [ids['Dani Cruz']]: ids['Rocco Vale'], [ids['Tommy Reyes']]: ids['Rocco Vale'], [ids['Kira Lane']]: ids['Rocco Vale'], [ids['Don Vito']]: ids['Kira Lane'], [ids['Nico Bruno']]: ids['Kira Lane'], [ids['Rocco Vale']]: ids['Kira Lane'] },
    notes: 'Pushed from the warehouse side. Kira kept the plates coming the whole hold.',
    loggedBy: ids['Rocco Vale'], loggedByName: 'Rocco Vale', repStatus: 'confirmed', repBy: ids['Lena Russo'], closedBy: ids['Rocco Vale'],
  });
  await setDoc(doc(db, 'blacksites/bs1/loot/l1'), { label: 'Carbine Rifle', item: 'g_carbine_rifle', strain: null, field: 'meth', qty: 0, claims: { [ids['Rocco Vale']]: 1, [ids['Kira Lane']]: 1 }, dumped: true });
  await setDoc(doc(db, 'blacksites/bs1/loot/l2'), { label: '5.56x45mm Box', item: 'ammo_5_56x45mm_box', strain: null, field: 'meth', qty: 0, claims: { [ids['Dani Cruz']]: 2 }, dumped: true });
  await setDoc(doc(db, 'blacksites/bs1/photos/ph1'), { image: shot('DOCKS · LOOT', '#d4af37'), by: ids['Rocco Vale'], at: Timestamp.fromMillis(now - 2 * D) });
  await fight('bs2', {
    zone: 'Docks blacksite', at: Timestamp.fromMillis(now - 26 * H), result: 'loss', rivals: ['Vagos'], holdMins: 12, rep: 40,
    participants: P(['Rocco Vale', 'Dani Cruz', 'Tommy Reyes', 'Ghost']),
    stats: { [ids['Rocco Vale']]: st(3, 2, 0), [ids['Tommy Reyes']]: st(2, 3, 0), [ids['Ghost']]: st(0, 2, 2, ['armor']) },
    votes: { [ids['Tommy Reyes']]: ids['Rocco Vale'] },
    loggedBy: ids['Dani Cruz'], loggedByName: 'Dani Cruz', repStatus: 'pending',
  });
  await fight('bs3', {
    zone: 'Mirror Park hill', pinId: null, at: Timestamp.fromMillis(now - 2 * H), result: 'win', rivals: ['Ballas', 'Families'], holdMins: 33, rep: 300,
    participants: P(['Rocco Vale', 'Kira Lane', 'Don Vito', 'Tommy Reyes', 'Marco Gallo']),
    stats: { [ids['Rocco Vale']]: st(7, 1, 0), [ids['Kira Lane']]: st(3, 2, 4, ['ammo', 'meds', 'plates']), [ids['Tommy Reyes']]: st(5, 3, 0) },
    votes: { [ids['Kira Lane']]: ids['Rocco Vale'], [ids['Tommy Reyes']]: ids['Kira Lane'] },
    lootStatus: 'open', closesAt: Timestamp.fromMillis(now + 22 * H),
    notes: 'Held through two pushes. Families showed up late.',
    loggedBy: ids['Rocco Vale'], loggedByName: 'Rocco Vale', repStatus: 'pending',
  });
  await setDoc(doc(db, 'blacksites/bs3/loot/l1'), { label: 'MX-18 Rifle', item: 'w_mk18_rifle', strain: null, field: 'meth', qty: 1, claims: {} });
  await setDoc(doc(db, 'blacksites/bs3/loot/l2'), { label: 'Armor Plate', item: 'ar_armor_plate', strain: null, field: 'meth', qty: 6, claims: { [ids['Kira Lane']]: 2 } });
  await setDoc(doc(db, 'blacksites/bs3/loot/l3'), { label: '9x19mm Box', item: 'ammo_9x19mm_box', strain: null, field: 'meth', qty: 3, claims: { [ids['Rocco Vale']]: 1 } });
  await setDoc(doc(db, 'blacksites/bs3/loot/l4'), { label: 'Machete', item: 'm_machete', strain: null, field: 'meth', qty: 1, claims: {} });
  await setDoc(doc(db, 'blacksites/bs3/photos/ph1'), { image: shot('MIRROR PARK · HOLD', '#22c55e'), by: ids['Rocco Vale'], at: Timestamp.fromMillis(now - H) });
  await setDoc(doc(db, 'blacksites/bs3/photos/ph2'), { image: shot('MIRROR PARK · LOOT', '#d4af37'), by: ids['Kira Lane'], at: Timestamp.fromMillis(now - H) });
  await fight('bs4', {
    zone: 'Sandy airfield', pinId: null, at: Timestamp.fromMillis(now - 10 * D), result: 'draw', rivals: ['Lost MC'], holdMins: 20, rep: 120,
    participants: P(['Rocco Vale', 'Dani Cruz', 'Kira Lane', 'Ghost', 'Jax Holt']),
    stats: { [ids['Rocco Vale']]: st(4, 3, 0), [ids['Dani Cruz']]: st(5, 2, 0), [ids['Kira Lane']]: st(1, 1, 3, ['ammo']), [ids['Ghost']]: st(2, 2, 1), [ids['Jax Holt']]: st(0, 1, 2, ['meds']) },
    votes: { [ids['Rocco Vale']]: ids['Dani Cruz'], [ids['Kira Lane']]: ids['Dani Cruz'], [ids['Ghost']]: ids['Dani Cruz'] },
    loggedBy: ids['Dani Cruz'], loggedByName: 'Dani Cruz', repStatus: 'confirmed', repBy: ids['Don Vito'],
  });

  // Gear & Loadouts: shared builds and character loadouts
  const build = (id, by, name, weaponId, parts, notes, likes) =>
    setDoc(doc(db, 'builds', id), { name, weaponId, parts, notes, by: ids[by], byName: by, likes: Object.fromEntries(likes.map((n) => [ids[n], true])), at: Timestamp.fromMillis(now - likes.length * 7 * H) });
  const A = (w, s) => `a_${w}__${s}`;
  await build('bd1', 'Rocco Vale', 'Blacksite rifleman', 'w_mk18_rifle', { sight: A('mk18_rifle', 'mk18_ta02_acog'), magazine: A('mk18_rifle', 'mk18_30rd_std'), grip: A('mk18_rifle', 'mk18_m_lok_mvg_black'), light: A('mk18_rifle', 'mk18_dbal_a2'), stock: A('mk18_rifle', 'mk18_moe_magpul_black'), frame: A('mk18_rifle', 'mk18_black_frame') }, 'Holds the hill. ACOG for the long lanes at the docks.', ['Dani Cruz', 'Tommy Reyes', 'Kira Lane', 'Don Vito']);
  await build('bd2', 'Kira Lane', 'Runner SMG', 'w_ump45', { sight: A('ump45', 'ump45_aimdirect_micro_t_1'), magazine: A('ump45', '25rnd_magazine'), stock: A('ump45', 'ump45_folded_stock'), grip: A('ump45', 'magpul_afg_black') }, 'Light and quick for supply runs to the point.', ['Ghost', 'Jax Holt']);
  await build('bd3', 'Dani Cruz', 'Overwatch', 'w_m700_rifle', { sight: A('m700_rifle', 'm700_nightforce_atacr_1_8x24'), barrel: A('m700_rifle', 'm700_26in_barrel'), magazine: A('m700_rifle', 'm700_10rnd_aics'), stock: A('m700_rifle', 'm700_at_aics_sniper'), muzzle: A('m700_rifle', 'm700_muzzle_break_1') }, '', ['Rocco Vale', 'Don Vito', 'Marco Gallo']);
  await build('bd4', 'Tommy Reyes', 'Quiet Combat Pistol', 'g_combat_pistol', { muzzle: 'bm_pistol_suppressor', magazine: 'bm_pistol_extmag' }, 'Black Market suppressor and mag.', ['Nico Bruno']);
  await build('bd5', 'Ghost', 'Block-17 Tan kit', 'w_block_17_pistol', { slide: A('block_17_pistol', 'b17_zev_custom_tan'), frame: A('block_17_pistol', 'b17_tan'), magazine: A('block_17_pistol', 'b17_20rd_extended'), barrel: A('block_17_pistol', 'b17_threaded_sai_barrel_tan') }, '', []);
  await setDoc(doc(db, 'loadouts', vito), {
    public: true, vest: 'ar_class_iii_armor', plates: 3,
    primary: { item: 'w_mk18_rifle', parts: { sight: A('mk18_rifle', 'mk18_ta02_acog'), magazine: A('mk18_rifle', 'mk18_30rd_std'), grip: A('mk18_rifle', 'mk18_m_lok_mvg_black'), stock: A('mk18_rifle', 'mk18_moe_magpul_black') } },
    sidearm: { item: 'w_pn905_pistol', parts: { magazine: 'a_pn905_pistol__pn_905_17rd' } },
    melee: 'v_pumpkin_bat', bag: 'k_duffel_bag',
    utility: [{ item: 't_molotov', qty: 3 }, { item: 't_pipe_bomb', qty: 1 }, { item: 'k_tablet', qty: 1 }, { item: 'k_medkit', qty: 2 }],
    at: Timestamp.fromMillis(now - H),
  });
  await setDoc(doc(db, 'loadouts', ids['Rocco Vale']), { public: false, vest: 'ar_class_iii_armor', plates: 4, primary: { item: 'w_mk18_rifle', parts: {} }, utility: [], at: Timestamp.fromMillis(now - H) });

  // Family cards (sample art; the real ones are images the Boss uploads)
  const card = (roman, name, rank, suit, color, glyph) =>
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="660" viewBox="0 0 400 660">
      <defs><radialGradient id="b" cx=".5" cy=".42" r=".7"><stop offset="0" stop-color="#2a2238"/><stop offset="1" stop-color="#07070d"/></radialGradient>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#d4af37"/><stop offset="1" stop-color="#7a5a14"/></linearGradient></defs>
      <rect width="400" height="660" fill="url(#b)"/>
      <rect x="18" y="18" width="364" height="624" rx="14" fill="none" stroke="url(#g)" stroke-width="3"/>
      <rect x="30" y="30" width="340" height="600" rx="10" fill="none" stroke="#d4af37" stroke-opacity=".4" stroke-dasharray="3 5"/>
      <text x="200" y="78" text-anchor="middle" font-family="Georgia,serif" font-size="30" fill="url(#g)" letter-spacing="6">${roman}</text>
      <text x="50" y="118" font-family="Georgia,serif" font-size="34" fill="${color}">${rank}</text><text x="52" y="152" font-family="Georgia,serif" font-size="30" fill="${color}">${suit}</text>
      <g transform="rotate(180 200 330)"><text x="50" y="118" font-family="Georgia,serif" font-size="34" fill="${color}">${rank}</text><text x="52" y="152" font-family="Georgia,serif" font-size="30" fill="${color}">${suit}</text></g>
      <circle cx="200" cy="330" r="118" fill="none" stroke="#d4af37" stroke-opacity=".5"/><circle cx="200" cy="330" r="96" fill="none" stroke="#d4af37" stroke-opacity=".3" stroke-dasharray="2 4"/>
      <text x="200" y="368" text-anchor="middle" font-family="Georgia,serif" font-size="120" fill="url(#g)">${glyph}</text>
      <text x="200" y="560" text-anchor="middle" font-family="Georgia,serif" font-size="30" fill="url(#g)" letter-spacing="4">${name}</text>
      <text x="200" y="596" text-anchor="middle" font-family="Georgia,serif" font-size="14" fill="#d4af37" fill-opacity=".7" letter-spacing="6">THE CHOSEN</text></svg>`);
  const fc = (who, roman, name, rank, suit, color, glyph, title) =>
    setDoc(doc(db, 'familyCards', ids[who]), { image: card(roman, name, rank, suit, color, glyph), title, by: vito, at: Timestamp.fromMillis(now - 3 * D) });
  await fc('Don Vito', 'IV', 'THE EMPEROR', 'K', '♠', '#e8e2cf', '♛', 'The Emperor · King of Spades');
  await fc('Rocco Vale', 'VII', 'THE CHARIOT', 'J', '♦', '#d9534f', '⚔', 'The Chariot · Jack of Diamonds');
  await fc('Kira Lane', 'XVII', 'THE STAR', '7', '♥', '#d9534f', '✦', 'The Star · Seven of Hearts');
  await fc('Lena Russo', 'X', 'WHEEL OF FORTUNE', 'Q', '♣', '#e8e2cf', '☸', 'Wheel of Fortune · Queen of Clubs');

  await setDoc(doc(db, 'settings/gang'), { name: 'The Chosen', motto: 'Chosen by blood. Bound in gold.' });
  await setDoc(doc(db, 'settings/announcement'), {
    text: 'Blacksite at the docks Friday 9PM ET. Hit Squad leads, everyone else on standby. Bring armor.',
    by: ids['Don Vito'],
    at: Timestamp.fromMillis(now - 2 * 3600_000),
  });
});
await env.cleanup();
console.log(`Seeded ${PEOPLE.length + 1} members and 4 crews. Sign in as "Don Vito" / ${PIN}.`);
