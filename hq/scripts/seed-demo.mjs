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
const ALL = { approveMembers: true, manageMembers: true, resetPins: true, manageCrews: true, manageRanks: true, manageSettings: true, postAnnouncements: true, confirmRep: true, manageOps: true, money: true, awardTrophies: true, familyCards: true, washMoney: true };
const PAGE_IDS = ['narcotics', 'stash', 'blackmarket', 'blacksites', 'gear', 'pettycrime', 'family', 'map', 'calendar'];
const pages = (ids) => Object.fromEntries(ids.map((p) => [p, true]));
const BASIC = pages(['blacksites', 'gear', 'pettycrime', 'family']);

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

  // Birthdays and a couple of old hands.
  const BDAYS = { 'Don Vito': '10-18', 'Rocco Vale': '10-09', 'Kira Lane': '10-24', 'Ghost': '11-02', 'Lena Russo': '03-14' };
  const etParts = (ms) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(ms).map((x) => [x.type, +x.value || x.value]));
  for (const [name] of PEOPLE) {
    if (BDAYS[name]) await setDoc(doc(db, 'members', ids[name]), { birthday: BDAYS[name] }, { merge: true });
  }
  const t0 = etParts(now);
  await setDoc(doc(db, 'members', ids['Don Vito']), { admin: true, joinedAt: Timestamp.fromMillis(Date.UTC(t0.year - 2, 9, 12, 16)) }, { merge: true });
  await setDoc(doc(db, 'members', ids['Sal Moretti']), { joinedAt: Timestamp.fromMillis(Date.UTC(t0.year - 1, 9, 9, 16)) }, { merge: true });

  // Petty crime
  const REP = { 'Don Vito': 120, 'Rocco Vale': 340, 'Dani Cruz': 210, 'Tommy Reyes': 185, 'Kira Lane': 95, Ghost: 60, 'Jax Holt': 30 };
  for (const [name, rep] of Object.entries(REP)) await setDoc(doc(db, 'petty', ids[name]), { rep });
  const crimes = [
    ['Don Vito', { Delivery: 6, Arson: 2 }, 48, 9200, 'Paleto run, two torches on the way back', 3],
    ['Don Vito', { Vehicle: 3 }, 30, 6400, 'Sultan RS to the chop shop', 26],
    ['Don Vito', { Delivery: 4 }, 22, 3800, '', 50],
    ['Don Vito', { Assassination: 1, Special: 1 }, 40, 12000, 'Quiet one', 75],
    ['Rocco Vale', { Arson: 7, Delivery: 2 }, 70, 14000, '', 8],
    ['Dani Cruz', { Assassination: 3 }, 60, 21000, '', 30],
    ['Kira Lane', { Delivery: 12 }, 55, 8000, '', 20],
    ['Tommy Reyes', { Vehicle: 5, Special: 2 }, 52, 11500, '', 40],
  ];
  for (const [i, [who, tally, rep, cash, notes, hoursAgo]] of crimes.entries()) {
    const crime = Object.entries(tally).map(([k, v]) => `${k} ×${v}`).join(' · ');
    await setDoc(doc(db, 'pettyLog', `c${i}`), { memberId: ids[who], crime, crimes: tally, perJob: [], rep, cash, cashId: null, notes, at: Timestamp.fromMillis(now - hoursAgo * 3600_000) });
  }
  await setDoc(doc(db, 'pettyGoals', ids['Don Vito']), { weekly: 200 });
  await setDoc(doc(db, 'settings', 'pettyGoal'), { title: 'October push', target: 1000, by: new Date(now + 20 * 86400_000).toISOString().slice(0, 10), from: Timestamp.fromMillis(now - 40 * 86400_000) });
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
  await loc('noel_basement', { kind: 'stash', name: "Tempest's Basement", postal: '9359' });
  await loc('noel_lockup', { kind: 'stash', name: 'Docks Lockup', postal: '10060' });
  for (const g of ['g7078', 'g9182', 'g9043']) await loc(g, { kind: 'grow', name: g });
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
    await setDoc(doc(db, 'sales', `s${i}`), {
      product, qty, from, fromLabel, sellerId: ids[who], sellerName: who, cut: i < 4 ? 0 : cut, price, narco: true, note: i === 2 ? 'Pier buyer' : '', byName: who,
      // The newest few are new-style Narco calls with a team.
      ...(i < 4 ? { kind: 'gang', callId: `call${i}`, team: i === 0 ? [ids['Marco Gallo'], ids['Kira Lane']] : i === 2 ? [ids['Dani Cruz']] : [] } : {}),
      at: Timestamp.fromMillis(now - hoursAgo * H), ...sign,
    });
  // A personal sale out of Vito's own locker, with a crew; he paid Rocco out of the sale.
  await setDoc(doc(db, 'sales', 'sp'), { product: 'meth', qty: 1, from: `lockerStock/${ids['Don Vito']}__home`, fromLabel: 'My Home', sellerId: ids['Don Vito'], sellerName: 'Don Vito', cut: 0, price: 24000, narco: true, note: '', byName: 'Don Vito', kind: 'personal', callId: 'callp', team: [ids['Rocco Vale']], at: Timestamp.fromMillis(now - 3 * H), ...sign });
  await setDoc(doc(db, 'teamPays', 'tp0'), { callId: 'callp', saleId: 'sp', from: ids['Don Vito'], to: ids['Rocco Vale'], dirty: 6000, source: 'sale', fromBank: 0, at: Timestamp.fromMillis(now - 2 * H) });
  // Wash requests: one waiting, one being washed, one done.
  const wr = (id, who, dirty, status, claimer, hoursAgo) =>
    setDoc(doc(db, 'washRequests', id), { memberId: ids[who], memberName: who, dirty, pct: 50, clean: dirty / 2, status, claimerId: claimer ? ids[claimer] : null, claimerName: claimer, note: '', at: Timestamp.fromMillis(now - hoursAgo * H), ...(status === 'done' ? { doneAt: Timestamp.fromMillis(now - (hoursAgo - 1) * H) } : {}) });
  await wr('wr0', 'Kira Lane', 12000, 'open', null, 1);
  await wr('wr1', 'Don Vito', 20000, 'claimed', 'Lena Russo', 5);
  await wr('wr2', 'Marco Gallo', 30000, 'done', 'Lena Russo', 30);
  await setDoc(doc(db, 'washes', 'w0'), { memberId: ids['Lena Russo'], memberName: 'Lena Russo', dirty: 30000, pct: 50, clean: 15000, note: 'Laundromat', byName: 'Lena Russo', at: Timestamp.fromMillis(now - 4 * H), ...sign });
  await setDoc(doc(db, 'washes', 'w1'), { memberId: ids['Marco Gallo'], memberName: 'Marco Gallo', dirty: 40000, pct: 50, clean: 20000, note: '', byName: 'Lena Russo', at: Timestamp.fromMillis(now - 2 * D), ...sign });
  await setDoc(doc(db, 'ledger', 'l0'), { type: 'payout', amount: 7600, toId: ids['Lena Russo'], toName: 'Lena Russo', note: 'Weekly cut', byName: 'Lena Russo', at: Timestamp.fromMillis(now - D) });
  await setDoc(doc(db, 'ledger', 'l1'), { type: 'expense', amount: 12000, toId: null, note: 'Lab supplies', byName: 'Lena Russo', at: Timestamp.fromMillis(now - 3 * D) });
  await setDoc(doc(db, 'settings', 'blackmarket'), {
    prices: { dosidos: 19000, nl: 17000, acapulco: 17500, rainbow: 17500, meth: 25000, cokeSmall: 22000, cokeLarge: 61000, p_lockpicks: 400 },
    defaultCut: 20, cuts: { [ids['Kira Lane']]: 15, [ids['Jax Holt']]: 15, [ids['Rocco Vale']]: 25, [ids['Don Vito']]: 30 }, washPct: 50,
    wishFields: [{ id: 'pay', label: 'Will pay' }],
  });
  await setDoc(doc(db, 'wishes', 'x0'), { title: 'Thermite', qty: 3, notes: 'For the bank job', fields: { pay: '$5k each' }, byId: ids['Rocco Vale'], byName: 'Rocco Vale', status: 'open', claimerId: null, claimerName: null, priority: 'urgent', offer: 15000, at: Timestamp.fromMillis(now - 5 * H) });
  await setDoc(doc(db, 'wishes', 'x2'), { title: 'Armor Plate', qty: 4, notes: '', fields: {}, itemId: 'ar_armor_plate', byId: ids['Don Vito'], byName: 'Don Vito', status: 'done', claimerId: ids['Tommy Reyes'], claimerName: 'Tommy Reyes', at: Timestamp.fromMillis(now - 30 * H), doneAt: Timestamp.fromMillis(now - 6 * H) });
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
  // Stash: owners, minimums and values; a reminder to bring something back; the admin move log and a snapshot.
  await setDoc(doc(db, 'locations', 'main'), { owners: [vito], takeRank: 'soldier', mins: { g_50_pistol: 4, g_carbine_rifle: 5, ar_armor_plate: 30, lockpick: 10, s_weapon_repair_kit: 3 }, values: { g_50_pistol: 4500, g_carbine_rifle: 22000, w_mk18_rifle: 38000, ar_armor_plate: 900, ar_class_iii_armor: 2500, lockpick: 300 } }, { merge: true });
  await setDoc(doc(db, 'locations', 'noel_lockup'), { createdBy: ids['Rocco Vale'], owners: [ids['Rocco Vale']], seeRank: 'soldier', takeRank: 'lieutenant', mins: { g_smg: 3 }, values: { g_smg: 12000, g_carbine_rifle: 22000 } }, { merge: true });
  await setDoc(doc(db, 'nudges', 'nd0'), { to: ids['Tommy Reyes'], from: vito, fromName: 'Don Vito', signoutId: 'so1', text: 'Bring the SMG back to the lockup', at: Timestamp.fromMillis(now - 2 * H) });
  const mv = (id, back, m) => setDoc(doc(db, 'stashLog', id), { at: Timestamp.fromMillis(now - back * H), ...m });
  await mv('mv0', 30, { kind: 'deposit', by: ids['Rocco Vale'], byName: 'Rocco Vale', from: null, to: 'main', toLabel: 'Main Stash', key: 'ar_armor_plate', label: 'Armor Plate', qty: 12 });
  await mv('mv1', 9, { kind: 'take', by: ids['Tommy Reyes'], byName: 'Tommy Reyes', from: 'noel_lockup', fromLabel: 'Docks Lockup', to: null, key: 'g_smg', label: 'SMG', qty: 1 });
  await mv('mv2', 3, { kind: 'take', by: vito, byName: 'Don Vito', from: 'main', fromLabel: 'Main Stash', to: null, key: 'g_carbine_rifle', label: 'Carbine Rifle', qty: 1 });
  await mv('mv3', 1, { kind: 'transfer', by: vito, byName: 'Don Vito', from: 'main', fromLabel: 'Main Stash', to: 'noel_basement', toLabel: "Tempest's Basement", key: 'g_50_pistol', label: '.50 Pistol', qty: 2 });
  const yday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(now - 86400_000));
  await setDoc(doc(db, 'stashSnaps', yday), { day: yday, counts: { main: { g_50_pistol: 8, g_carbine_rifle: 4, ar_armor_plate: 12, lockpick: 15 }, noel_lockup: { g_carbine_rifle: 4, g_smg: 3 } }, at: Timestamp.fromMillis(now - 86400_000) });
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
  await pin('p1', 'Marco Gallo', 'Leon VW grow', 'grow', 0.52, 0.71, 'gang', { postal: '7078', note: 'Knock twice.' });
  await pin('p2', 'Marco Gallo', 'Leon JT grow', 'grow', 0.61, 0.66, 'gang', { postal: '9182' });
  await pin('p3', 'Don Vito', 'Main Stash', 'stash', 0.44, 0.78, 'limited', { ranks: [...LEAD, 'caporegime', 'lieutenant'], minRank: 'lieutenant', note: 'Lieutenant and up only.', postal: '8021', access: 'Keypad 4471 · back door key with Lena', stashId: 'main', at: Timestamp.fromMillis(now - 3 * D) });
  await pin('p4', 'Nico Bruno', 'Blue Kitchen lab', 'lab', 0.70, 0.40, 'limited', { ranks: LEAD, note: 'Leadership only.' });
  await pin('p5', 'Rocco Vale', 'Docks blacksite', 'blacksite', 0.38, 0.88, 'gang', { note: 'King of the Hill zone. Friday 9PM.' });
  await pin('p6', 'Rocco Vale', 'Ballas block', 'rival', 0.56, 0.84, 'gang', { note: 'Stay off after dark.' });
  await pin('p7', 'Don Vito', 'Our corner', 'turf', 0.48, 0.74, 'gang');
  await pin('p8', 'Don Vito', 'Pier meet', 'meet', 0.31, 0.80, 'gang', { note: 'Buyers meet here.' });
  await pin('p9', 'Don Vito', 'My safehouse', 'other', 0.66, 0.22, 'personal', { note: 'Only I see this one.' });
  await pin('p10', 'Lena Russo', 'Laundromat', 'shop', 0.53, 0.77, 'limited', { ranks: LEAD, note: 'Washes at 50%.' });

  // Calendar
  const at = (daysFromNow, h, m = 0) => { const p = etParts(now + daysFromNow * D); return Timestamp.fromMillis(Date.UTC(p.year, p.month - 1, p.day, h + 4, m)); };
  const ev = (id, owner, title, kind, start, mins, repeat, scope, extra = {}) =>
    setDoc(doc(db, 'events', id), { owner: ids[owner], ownerName: owner, title, kind, start, mins, repeat, scope, ranks: [], crewIds: [], minRank: null, place: '', note: '', rsvp: { [ids[owner]]: 'yes' }, ...extra });
  await ev('e1', 'Don Vito', 'Family sit-down', 'meeting', at(-6, 20), 60, 'weekly', 'gang', { place: 'The Yacht', note: 'Weekly. Bring numbers.', rsvp: { [ids['Don Vito']]: 'yes', [ids['Sal Moretti']]: 'yes', [ids['Lena Russo']]: 'yes', [ids['Rocco Vale']]: 'maybe', [ids['Ghost']]: 'no' } });
  await ev('e2', 'Rocco Vale', 'Docks blacksite', 'blacksite', at(3, 21), 120, 'none', 'gang', { place: 'Docks blacksite', pinId: 'spot:sp_docks', note: 'Hit Squad leads, everyone else on standby. Bring armor.', rsvp: { [ids['Rocco Vale']]: 'yes', [ids['Dani Cruz']]: 'yes', [ids['Tommy Reyes']]: 'yes', [ids['Kira Lane']]: 'maybe' } });
  await ev('e3', 'Don Vito', 'Leadership: territory talk', 'meeting', at(1, 19), 60, 'none', 'limited', { ranks: LEAD, note: 'Leadership only.' });
  await ev('e4', 'Marco Gallo', 'Coca leaves harvest', 'op', at(-2, 18), 60, 'weekly', 'limited', { ranks: LEAD });
  await ev('e5', 'Lena Russo', 'Payout day', 'other', at(-5, 17), 30, 'biweekly', 'gang', { place: 'Laundromat' });
  await ev('e8', 'Don Vito', 'Buyer meet', 'meeting', at(2, 22), 30, 'none', 'gang', { place: 'Pier meet', pinId: 'p8' });
  await ev('e9', 'Sal Moretti', 'Quick sit-down', 'meeting', Timestamp.fromMillis(now + 40 * 60_000), 30, 'none', 'gang', { place: 'Pier meet', pinId: 'p8', rsvp: { [ids['Sal Moretti']]: 'yes', [ids['Don Vito']]: 'yes', [ids['Rocco Vale']]: 'maybe' } });
  await ev('e6', 'Kira Lane', 'Fleeca job', 'heist', at(8, 22), 90, 'none', 'limited', { ranks: LEAD });
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
  await setDoc(doc(db, 'blacksites/bs3/loot/l2'), { label: 'Armor Plate', item: 'ar_armor_plate', strain: null, field: 'meth', qty: 4, claims: {}, assigned: { [ids['Kira Lane']]: 2, [ids['Don Vito']]: 2 }, collected: { [ids['Kira Lane']]: 2 } });
  await setDoc(doc(db, 'blacksites/bs3/loot/l3'), { label: '9x19mm Box', item: 'ammo_9x19mm_box', strain: null, field: 'meth', qty: 3, claims: {} });
  await setDoc(doc(db, 'blacksites/bs3/loot/l4'), { label: 'Machete', item: 'm_machete', strain: null, field: 'meth', qty: 1, claims: {} });
  await setDoc(doc(db, 'blacksites/bs3/photos/ph1'), { image: shot('MIRROR PARK · HOLD', '#22c55e'), by: ids['Rocco Vale'], at: Timestamp.fromMillis(now - H) });
  await setDoc(doc(db, 'blacksites/bs3/photos/ph2'), { image: shot('MIRROR PARK · LOOT', '#d4af37'), by: ids['Kira Lane'], at: Timestamp.fromMillis(now - H) });
  // Blacksite locations, with a couple more fights so the records fill in
  const spot = (id, name, x, y, notes) => setDoc(doc(db, 'blacksiteSpots', id), { name, x, y, notes, by: ids['Don Vito'], at: Timestamp.fromMillis(now - 30 * D) });
  await spot('sp_docks', 'Docks blacksite', 0.62, 0.86, 'Come in from the warehouse side. Park behind the containers; the crane gives a long angle on the gate.');
  await spot('sp_mirror', 'Mirror Park hill', 0.74, 0.42, '');
  await spot('sp_sandy', 'Sandy airfield', 0.55, 0.28, 'Wide open. Bring snipers and a fast car.');
  await spot('sp_paleto', 'Paleto sawmill', null, null, '');
  for (const [id, sp] of [['bs1', 'sp_docks'], ['bs2', 'sp_docks'], ['bs3', 'sp_mirror']]) await setDoc(doc(db, 'blacksites', id), { spotId: sp }, { merge: true });
  await fight('bs4', {
    zone: 'Sandy airfield', spotId: 'sp_sandy', at: Timestamp.fromMillis(now - 5 * D), result: 'win', rivals: ['Vagos'], holdMins: 28, rep: 220, calledIn: true,
    participants: P(['Dani Cruz', 'Ghost', 'Jax Holt', 'Don Vito']),
    stats: { [ids['Dani Cruz']]: st(8, 1, 0), [ids['Ghost']]: st(2, 1, 3, ['plates']), [ids['Jax Holt']]: st(3, 2, 0) },
    votes: { [ids['Ghost']]: ids['Dani Cruz'], [ids['Jax Holt']]: ids['Dani Cruz'] },
    loggedBy: ids['Don Vito'], loggedByName: 'Don Vito', repStatus: 'confirmed', repBy: ids['Lena Russo'],
  });
  await fight('bs5', {
    zone: 'Paleto sawmill', spotId: 'sp_paleto', at: Timestamp.fromMillis(now - 9 * D), result: 'draw', rivals: ['Families'], holdMins: 15, rep: 60,
    participants: P(['Rocco Vale', 'Kira Lane', 'Nico Bruno']), stats: { [ids['Rocco Vale']]: st(4, 3, 0) }, votes: {},
    loggedBy: ids['Rocco Vale'], loggedByName: 'Rocco Vale', repStatus: 'confirmed', repBy: ids['Lena Russo'],
  });
  await fight('bs4', {
    zone: 'Sandy airfield', pinId: null, at: Timestamp.fromMillis(now - 10 * D), result: 'draw', rivals: ['Lost MC'], holdMins: 20, rep: 120,
    participants: P(['Rocco Vale', 'Dani Cruz', 'Kira Lane', 'Ghost', 'Jax Holt']),
    stats: { [ids['Rocco Vale']]: st(4, 3, 0), [ids['Dani Cruz']]: st(5, 2, 0), [ids['Kira Lane']]: st(1, 1, 3, ['ammo']), [ids['Ghost']]: st(2, 2, 1), [ids['Jax Holt']]: st(0, 1, 2, ['meds']) },
    votes: { [ids['Rocco Vale']]: ids['Dani Cruz'], [ids['Kira Lane']]: ids['Dani Cruz'], [ids['Ghost']]: ids['Dani Cruz'] },
    loggedBy: ids['Dani Cruz'], loggedByName: 'Dani Cruz', repStatus: 'confirmed', repBy: ids['Don Vito'],
  });

  // Gear & Loadouts: shared builds and character loadouts
  const TAGS = { bd1: ['Blacksite', 'Defense'], bd2: ['Run', 'CQB'], bd3: ['Long range', 'Blacksite'], bd4: ['Stealth', 'Budget'], bd5: ['CQB'] };
  const build = (id, by, name, weaponId, parts, notes, likes, pub = true) =>
    setDoc(doc(db, 'builds', id), { name, weaponId, parts, notes, by: ids[by], byName: by, tags: TAGS[id] ?? [], public: pub, likes: Object.fromEntries(likes.map((n) => [ids[n], true])), saves: id === 'bd1' || id === 'bd3' ? { [vito]: true } : {}, at: Timestamp.fromMillis(now - likes.length * 7 * H) });
  const A = (w, s) => `a_${w}__${s}`;
  await build('bd1', 'Rocco Vale', 'Blacksite rifleman', 'w_mk18_rifle', { sight: A('mk18_rifle', 'mk18_ta02_acog'), magazine: A('mk18_rifle', 'mk18_30rd_std'), grip: A('mk18_rifle', 'mk18_m_lok_mvg_black'), light: A('mk18_rifle', 'mk18_dbal_a2'), stock: A('mk18_rifle', 'mk18_moe_magpul_black'), frame: A('mk18_rifle', 'mk18_black_frame') }, 'Holds the hill. ACOG for the long lanes at the docks.', ['Dani Cruz', 'Tommy Reyes', 'Kira Lane', 'Don Vito']);
  await build('bd2', 'Kira Lane', 'Runner SMG', 'w_ump45', { sight: A('ump45', 'ump45_aimdirect_micro_t_1'), magazine: A('ump45', '25rnd_magazine'), stock: A('ump45', 'ump45_folded_stock'), grip: A('ump45', 'magpul_afg_black') }, 'Light and quick for supply runs to the point.', ['Ghost', 'Jax Holt']);
  await build('bd3', 'Dani Cruz', 'Overwatch', 'w_m700_rifle', { sight: A('m700_rifle', 'm700_nightforce_atacr_1_8x24'), barrel: A('m700_rifle', 'm700_26in_barrel'), magazine: A('m700_rifle', 'm700_10rnd_aics'), stock: A('m700_rifle', 'm700_at_aics_sniper'), muzzle: A('m700_rifle', 'm700_muzzle_break_1') }, '', ['Rocco Vale', 'Don Vito', 'Marco Gallo']);
  await build('bd4', 'Tommy Reyes', 'Quiet Combat Pistol', 'g_combat_pistol', { muzzle: 'bm_pistol_suppressor', magazine: 'bm_pistol_extmag' }, 'Black Market suppressor and mag.', ['Nico Bruno']);
  await build('bd5', 'Ghost', 'Block-17 Tan kit', 'w_block_17_pistol', { slide: A('block_17_pistol', 'b17_zev_custom_tan'), frame: A('block_17_pistol', 'b17_tan'), magazine: A('block_17_pistol', 'b17_20rd_extended'), barrel: A('block_17_pistol', 'b17_threaded_sai_barrel_tan') }, '', []);
  await build('bd6', 'Don Vito', 'Heist MK18 (draft)', 'w_mk18_rifle', { sight: A('mk18_rifle', 'mk18_ta02_acog'), light: A('mk18_rifle', 'mk18_dbal_a2') }, 'Still working on it.', [], false);
  // Kits: Vito's Everyday (equipped) and a Heist plan, Rocco's Blacksite kit
  const mk18 = { item: 'w_mk18_rifle', qty: 1, parts: { sight: A('mk18_rifle', 'mk18_ta02_acog'), magazine: A('mk18_rifle', 'mk18_30rd_std'), grip: A('mk18_rifle', 'mk18_m_lok_mvg_black'), stock: A('mk18_rifle', 'mk18_moe_magpul_black') } };
  const kitDoc = (owner, name, extra) => ({ owner, name, public: true, mode: 'real', hotbar: [null, null, null, null, null], bag: [], vest: null, plates: 0, bagType: null, outfit: '', vehicle: null, at: Timestamp.fromMillis(now - H), ...extra });
  await setDoc(doc(db, 'kits', 'kit_vito_every'), kitDoc(vito, 'Everyday', {
    hotbar: [mk18, { item: 'w_pn905_pistol', qty: 1, parts: { magazine: 'a_pn905_pistol__pn_905_17rd' } }, { item: 'v_pumpkin_bat', qty: 1 }, { item: 'k_medkit', qty: 2 }, { item: 't_molotov', qty: 3 }],
    bag: [{ item: 't_pipe_bomb', qty: 1 }, { item: 'k_tablet', qty: 1 }, null, { item: 'k_medkit', qty: 1 }],
    vest: 'ar_class_iii_armor', plates: 3, bagType: 'k_duffel_bag', outfit: 'Oni mask, white Cursed tee, black beanie', vehicle: { name: 'Sultan RS', cls: 'sports' },
  }));
  await setDoc(doc(db, 'kits', 'kit_vito_heist'), kitDoc(vito, 'Heist', {
    public: false, mode: 'plan',
    hotbar: [{ item: 'w_m700_rifle', qty: 1, parts: { sight: A('m700_rifle', 'm700_nightforce_atacr_1_8x24') } }, mk18, { item: 't_pipe_bomb', qty: 4 }, null, { item: 'k_medkit', qty: 3 }],
    vest: 'ar_class_iii_armor', plates: 6, bagType: 'k_duffel_bag', outfit: 'All black, balaclava', vehicle: { name: 'Kuruma (Armored)', cls: 'sports' },
  }));
  await setDoc(doc(db, 'kitPicks', vito), { kit: 'kit_vito_every' });
  await setDoc(doc(db, 'kits', 'kit_rocco_bs'), kitDoc(ids['Rocco Vale'], 'Blacksite', { hotbar: [{ item: 'w_mk18_rifle', qty: 1, parts: {} }, null, null, null, null], vest: 'ar_class_iii_armor', plates: 4, vehicle: { name: 'Baller', cls: 'suv' } }));
  await setDoc(doc(db, 'kitPicks', ids['Rocco Vale']), { kit: 'kit_rocco_bs' });

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

  // A filled-in character sheet, a couple of journal entries and leadership notes.
  await setDoc(doc(db, 'sheets', ids['Don Vito']), {
    basics: { fullName: 'Vittorio "Don" Amato', age: '52', hometown: 'Palermo', nationality: 'Italian', height: "6'1\"", build: 'Broad' },
    looks: { hair: 'Silver, slicked back', eyes: 'Dark brown', marks: 'Scar across the left palm', outfit: 'Charcoal three-piece, gold cufflinks', distinct: 'Never takes his rings off' },
    city: { job: 'Owns the Velvet Room club', vehicles: 'Black Enus Windsor', homePostal: '8021', hangout: 'Back booth at the Velvet Room' },
    story: {
      quote: 'Loyalty is the only currency that never washes clean.',
      backstory: 'Came over on a cargo ship with nothing but a name. Ran numbers for the old Amato crew until there was no old crew left.',
      joined: 'Founded the family the night the docks burned.',
      goals: 'Own every port in the city.',
      fears: 'Dying in a hospital bed.',
    },
    traits: ['Patient', 'Ruthless', 'Old-fashioned', 'Generous to his own'],
    skills: { Shooting: 3, Melee: 2, Tactics: 5, Driving: 2, Stealth: 1, Lockpicking: 1, Hacking: 0, Charisma: 5, Intimidation: 5, Negotiation: 5, Cooking: 1, Growing: 2, Mechanic: 0, Medic: 1 },
    customSkills: [{ name: 'Wine', value: 5 }],
    customFields: [{ label: 'Favorite drink', value: 'Barolo, 1998' }],
    relations: [
      { memberId: ids['Lena Russo'], name: 'Lena Russo', kind: 'Protégé', note: 'Smartest in the room. Don’t tell her.' },
      { memberId: ids['Marco Gallo'], name: 'Marco Gallo', kind: 'Rival', note: 'Wants the chair.' },
      { memberId: null, name: 'Det. Hollis', kind: 'Owes me', note: 'LSPD. Paid off twice.' },
    ],
    song: 'https://www.youtube.com/watch?v=HiR9KeIJ7Ao',
    wanted: { on: false, bounty: 250000, crime: 'running this city' },
  });
  await setDoc(doc(db, 'journal', 'j1'), { memberId: ids['Don Vito'], title: 'The night the docks burned', text: 'Three crews walked in. One walked out. We are the one.', public: true, reactions: { [ids['Lena Russo']]: '👑', [ids['Marco Gallo']]: '🔥' }, at: Timestamp.fromMillis(now - 20 * 86400_000) });
  await setDoc(doc(db, 'journal', 'j2'), { memberId: ids['Don Vito'], title: 'Note to self', text: 'Watch Marco.', public: false, reactions: {}, at: Timestamp.fromMillis(now - 2 * 86400_000) });
  await setDoc(doc(db, 'leaderNotes', 'n1'), { memberId: ids['Marco Gallo'], kind: 'warning', text: 'Late to the docks drop twice this week.', by: ids['Don Vito'], byName: 'Don Vito', at: Timestamp.fromMillis(now - 86400_000) });

  // Dashboard: streaks, yesterday's sales, family news.
  const dk = (back) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(now - back * 86400_000));
  await setDoc(doc(db, 'streaks', ids['Don Vito']), { current: 11, best: 31, last: dk(1), freezes: {}, loaFrom: null, loaUntil: null, at: Timestamp.fromMillis(now - 86400_000) });
  await setDoc(doc(db, 'streaks', ids['Lena Russo']), { current: 104, best: 104, last: dk(0), freezes: {}, loaFrom: null, loaUntil: null, at: Timestamp.fromMillis(now) });
  await setDoc(doc(db, 'daily', dk(1)), { sales: { [ids['Marco Gallo']]: 51000, [ids['Don Vito']]: 26000, [ids['Rocco Vale']]: 18000 } });
  await setDoc(doc(db, 'news', 'nw1'), { kind: 'joined', memberId: ids['Ghost'], rankId: 'associate', at: Timestamp.fromMillis(now - 2 * 86400_000) });
  await setDoc(doc(db, 'news', 'nw2'), { kind: 'promoted', memberId: ids['Rocco Vale'], rankId: 'lieutenant', at: Timestamp.fromMillis(now - 5 * 3600_000) });

  // Hall of Fame: a legend, an MVP of last month, and a member who passed.
  const lastYm = (() => { const d = new Date(now); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  await setDoc(doc(db, 'monthMvp', lastYm), { memberId: ids['Rocco Vale'], why: 'Held Mirror Park alone for twenty minutes.', by: ids['Don Vito'] });
  await setDoc(doc(db, 'legends', 'lg1'), { memberId: ids['Don Vito'], name: 'Don Vito', title: 'The Night the Docks Burned', text: 'Three crews walked in. One walked out. The Chosen began here.', by: ids['Don Vito'], at: Timestamp.fromMillis(now - 30 * 86400_000) });
  await setDoc(doc(db, 'members', ids['Tommy Reyes']), { status: 'suspended' }, { merge: true });
  await setDoc(doc(db, 'pastMembers', ids['Tommy Reyes']), { kind: 'deceased', day: dk(12), epitaph: 'Took the first bullet so we could take the hill.' });
  await setDoc(doc(db, 'tributes', ids['Tommy Reyes']), { candles: { [ids['Lena Russo']]: true, [ids['Rocco Vale']]: true, [ids['Kira Lane']]: true } });
  await setDoc(doc(db, 'tributes', ids['Tommy Reyes'], 'memories', 'mm1'), { by: ids['Rocco Vale'], byName: 'Rocco Vale', text: 'Best tank I ever ran with.', at: Timestamp.fromMillis(now - 5 * 86400_000) });

  // Star colors in the Family sky.
  for (const [who, star] of [['Lena Russo', 'rose'], ['Rocco Vale', 'crimson'], ['Kira Lane', 'ice'], ['Marco Gallo', 'emerald'], ['Nico Bruno', 'violet'], ['Ghost', 'white']])
    await setDoc(doc(db, 'sheets', ids[who]), { star }, { merge: true });

  // The demo boss is also an owner (normally set from GitHub), so the owner-only tools show.
  await setDoc(doc(db, 'meta', 'owners'), { ids: [vito] });
  // Roles on top of rank: jobs with powers, and honors.
  const all = { approveMembers: true, manageMembers: true, resetPins: true, manageCrews: true, manageRanks: true, manageSettings: true, postAnnouncements: true, confirmRep: true, manageOps: true, money: true, awardTrophies: true, familyCards: true, washMoney: true, manageEvents: true, hallOfFame: true };
  const role = (id, order, name, extra) => setDoc(doc(db, 'hqRoles', id), { name, order, perms: {}, pages: {}, ...extra });
  await role('high_table', 0, 'High Table', { lead: true, perms: all, note: 'Leadership powers, whatever their rank.' });
  await role('welcome', 1, 'Welcome Committee', { perms: { approveMembers: true }, note: 'Lets newcomers in and sends welcome notes.' });
  await role('rep_keeper', 2, 'Rep Keeper', { perms: { confirmRep: true }, pages: { pettycrime: true, blacksites: true }, note: 'Confirms petty and blacksite rep.' });
  await role('washer', 3, 'Washer', { perms: { washMoney: true }, pages: { blackmarket: true }, note: 'Takes and finishes wash requests.' });
  await role('event_planner', 4, 'Event Planner', { perms: { manageEvents: true }, pages: { calendar: true }, note: "Edits and removes anyone's gang events." });
  await role('archivist', 5, 'Archivist', { perms: { hallOfFame: true }, note: 'Keeps the Hall of Fame.' });
  await role('narco', 6, 'Narco', { pages: { narcotics: true }, note: 'Opens Narcotics and every drug detail in HQ. Hidden from everyone else (High Table always sees it).' });
  await role('enforcer', 7, 'Enforcer', { honor: true });
  await role('cop_killer', 8, 'Cop Killer', { honor: true });
  await role('founder', 9, 'Founder', { honor: true });
  const hold = (who, roles, perms = {}, pages = {}, lead = false) => setDoc(doc(db, 'roleHolders', ids[who]), { roles, perms, pages, lead });
  await hold('Don Vito', ['founder']);
  await hold('Rocco Vale', ['enforcer', 'cop_killer', 'rep_keeper'], { confirmRep: true }, { pettycrime: true, blacksites: true });
  await hold('Kira Lane', ['welcome', 'event_planner'], { approveMembers: true, manageEvents: true }, { calendar: true });
  await hold('Marco Gallo', ['washer', 'narco'], { washMoney: true }, { blackmarket: true, narcotics: true });
  await hold('Sal Moretti', ['high_table', 'archivist'], all, {}, true);
  // Money: dinner dues (Sundays), the gang books, payouts, a budget, savings goals and requests.
  const etDay = (back) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(now - back * 86400_000));
  const wdNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
  const sun = (k) => etDay(wdNow + 7 * k);
  const byRank = { boss: { rep: 500, clean: 10000, dirty: 15000 }, consigliere: { rep: 400, clean: 8000, dirty: 12000 }, underboss: { rep: 400, clean: 8000, dirty: 12000 }, treasurer: { rep: 300, clean: 6000, dirty: 10000 }, caporegime: { rep: 300, clean: 6000, dirty: 10000 }, lieutenant: { rep: 200, clean: 4000, dirty: 6000 }, enforcer: { rep: 100, clean: 2000, dirty: 3000 }, soldier: { rep: 100, clean: 2000, dirty: 3000 } };
  await setDoc(doc(db, 'settings', 'dues'), { day: 0, byRank });
  const owe = Object.fromEntries(PEOPLE.filter(([n, r]) => n !== 'Tommy Reyes' && r !== 'associate').map(([n, r]) => [ids[n], byRank[r]]));
  for (const k of [0, 1, 2]) await setDoc(doc(db, 'duesWeeks', sun(k)), { owe, excused: k === 0 ? { [ids['Ghost']]: 'Leadership excused' } : {}, at: Timestamp.fromMillis(now - (wdNow + 7 * k) * 86400_000) });
  // Dani is on leave this week: the dinner page excuses her as LOA.
  await setDoc(doc(db, 'streaks', ids['Dani Cruz']), { loaFrom: etDay(wdNow + 2), loaUntil: etDay(-5) }, { merge: true });
  let dp = 0;
  const pay = async (who, week, cash, amount, status) => setDoc(doc(db, 'duesPay', `dp${dp++}`), { memberId: ids[who], week, cash, amount, status, cashId: 'seed', at: Timestamp.fromMillis(now - 3 * H) });
  const tr = async (who, week, amount, status) => setDoc(doc(db, 'repTransfers', `dues${dp++}`), { memberId: ids[who], amount, status, dues: week, at: Timestamp.fromMillis(now - 2 * H), ...(status === 'confirmed' ? { decidedBy: vito } : {}) });
  for (const k of [1, 2]) for (const [n, r] of PEOPLE) {
    if (n === 'Tommy Reyes' || r === 'associate' || (k === 1 && n === 'Kira Lane')) continue;
    await pay(n, sun(k), 'clean', byRank[r].clean, 'confirmed');
    if (!(k === 1 && n === 'Rocco Vale')) await pay(n, sun(k), 'dirty', byRank[r].dirty, 'confirmed');
    await tr(n, sun(k), byRank[r].rep, 'confirmed');
  }
  await pay('Don Vito', sun(0), 'dirty', 15000, 'confirmed');
  await tr('Don Vito', sun(0), 500, 'confirmed');
  await pay('Don Vito', sun(0), 'clean', 10000, 'pending');
  for (const k of ['rep', 'clean', 'dirty']) k === 'rep' ? await tr('Rocco Vale', sun(0), 300, 'pending') : await pay('Rocco Vale', sun(0), k, byRank.caporegime[k], 'pending');
  await tr('Marco Gallo', sun(0), 100, 'confirmed');
  await pay('Marco Gallo', sun(0), 'clean', 1000, 'pending');
  const be = (id, dir, cash, amount, category, note, back, source = 'manual') => setDoc(doc(db, 'gangBook', id), { dir, cash, amount, category, note, memberId: null, source, ref: null, by: vito, byName: 'Don Vito', at: Timestamp.fromMillis(now - back * H) });
  await be('be0', 'in', 'clean', 120000, 'Income', 'Car dealership front', 120);
  await be('be1', 'out', 'dirty', 45000, 'Weapons', '6 carbines from the docks contact', 70);
  await be('be2', 'out', 'clean', 30000, 'Property', 'Rent on the Grove St house', 50);
  await be('be3', 'out', 'dirty', 12000, 'Bail & lawyers', "Getting Jax out", 20);
  await be('be4', 'out', 'clean', 8000, 'Vehicles', 'Repairs on the Sultan', 6);
  await be('be5', 'out', 'dirty', 25000, 'Savings', 'Clubhouse', 4, 'goal');
  await setDoc(doc(db, 'savingsGoals', 'g1'), { name: 'Clubhouse on Grove St', cash: 'dirty', target: 250000, saved: 25000, done: false, at: Timestamp.fromMillis(now - 100 * H) });
  await setDoc(doc(db, 'savingsGoals', 'g2'), { name: 'Armored Kuruma', cash: 'clean', target: 60000, saved: 0, done: false, at: Timestamp.fromMillis(now - 90 * H) });
  const month = new Date(now).toISOString().slice(0, 7);
  await setDoc(doc(db, 'budgets', month), { cats: { Weapons: { dirty: 60000, clean: 0 }, Vehicles: { dirty: 0, clean: 20000 }, Property: { dirty: 0, clean: 30000 }, 'Bail & lawyers': { dirty: 10000, clean: 0 }, Supplies: { dirty: 5000, clean: 5000 } } });
  await setDoc(doc(db, 'payouts', 'po1'), { memberId: ids['Rocco Vale'], memberName: 'Rocco Vale', cash: 'dirty', amount: 8000, reason: 'Loot from the docks blacksite', status: 'owed', by: vito, at: Timestamp.fromMillis(now - 10 * H) });
  await setDoc(doc(db, 'payouts', 'po2'), { memberId: vito, memberName: 'Don Vito', cash: 'clean', amount: 5000, reason: 'Fronted the plates', status: 'sent', by: vito, at: Timestamp.fromMillis(now - 8 * H) });
  await setDoc(doc(db, 'spendRequests', 'sr1'), { by: ids['Kira Lane'], byName: 'Kira Lane', cash: 'dirty', amount: 6000, category: 'Supplies', why: 'Radios and lockpicks for the next run', status: 'open', at: Timestamp.fromMillis(now - 5 * H) });
  await setDoc(doc(db, 'washRequests', 'gw2'), { memberId: 'gang', memberName: 'The gang', dirty: 30000, pct: 50, clean: 15000, status: 'claimed', claimerId: vito, claimerName: 'Don Vito', note: 'Gang money', timerMins: 15, timerEnd: Timestamp.fromMillis(now + 9 * 60_000), at: Timestamp.fromMillis(now - 2 * H) });
  await setDoc(doc(db, 'washRequests', 'gw3'), { memberId: ids['Rocco Vale'], memberName: 'Rocco Vale', dirty: 12000, pct: 50, clean: 6000, status: 'claimed', claimerId: vito, claimerName: 'Don Vito', note: '', at: Timestamp.fromMillis(now - 1 * H) });
  await setDoc(doc(db, 'washRequests', 'gw1'), { memberId: 'gang', memberName: 'The gang', dirty: 40000, pct: 50, clean: 20000, status: 'done', claimerId: ids['Marco Gallo'], claimerName: 'Marco Gallo', note: 'Gang money', at: Timestamp.fromMillis(now - 30 * H), doneAt: Timestamp.fromMillis(now - 26 * H) });

  // Welcome center: the checklist, two associates on their road, notes, vouches, and a fresh patch.
  await setDoc(doc(db, 'settings', 'welcome'), {
    steps: [
      ...['Presentation Given', 'Starter Package', 'Petty Crime', 'Chopping Cars', 'ATM Robberies', 'Store Robberies', 'Radio Etiquette', 'Resource Obtaining', 'Bylaws Knowledge', 'Family Knowledge', 'Narco Knowledge', 'General Etiquette'].map((title, i) => ({ id: ['presentation', 'starter', 'petty', 'chopping', 'atm', 'stores', 'radio', 'resources', 'bylaws', 'family', 'narco', 'etiquette'][i], title })),
      { id: 'oath', title: 'Ready for Oath', final: true },
    ],
    checklistV: 2,
    repTarget: 300,
    rulesVersion: 1,
    sections: [
      { title: 'The rules', body: '1. Family first. What happens in the family stays in the family.\n2. No beef with another gang without High Table saying so.\n3. Show up to dinner, pay your dues.\n4. Never touch product that isn\'t yours.\n\n(Placeholder rules until the real ones are pasted in.)' },
      { title: 'Who to ask', body: 'Your handlers are the Welcome Committee. Kira looks after new people. Anything about money goes to Lena.' },
    ],
  });
  const jax = ids['Jax Holt'], mia = ids['Mia Santos'], kira = ids['Kira Lane'];
  await setDoc(doc(db, 'onboarding', jax), { rulesAccepted: 1, rulesAt: Timestamp.fromMillis(now - 90 * H) });
  await setDoc(doc(db, 'sheets', jax), { basics: { origin: 'Sandy Shores', age: '24' }, story: { backstory: 'Grew up fixing bikes for the Lost MC, wanted something bigger.' } }, { merge: true });
  await setDoc(doc(db, 'petty', jax), { rep: 180 }, { merge: true });
  // Two-part sign-off: the associate signs (by/at), then a WC (confirmedName/confirmedAt).
  const ws = (who, name, step, wc, back) =>
    setDoc(doc(db, 'welcomeStamps', `${who}_${step}`), { memberId: who, stepId: step, status: wc ? 'done' : 'pending', by: who, byName: name, at: Timestamp.fromMillis(now - back * H), confirmedBy: wc ? ids[wc] : null, confirmedName: wc ?? null, confirmedAt: wc ? Timestamp.fromMillis(now - (back - 2) * H) : null });
  for (const [step, wc, back] of [['presentation', 'Kira Lane', 90], ['starter', 'Kira Lane', 88], ['petty', 'Rocco Vale', 70], ['chopping', 'Kira Lane', 50], ['atm', null, 6], ['radio', null, 3]]) await ws(jax, 'Jax Holt', step, wc, back);
  await ws(mia, 'Mia Santos', 'presentation', 'Kira Lane', 20);
  await ws(mia, 'Mia Santos', 'starter', null, 5);
  await setDoc(doc(db, 'onboarding', mia), { strikes: 1, strikesBy: 'Kira Lane' }, { merge: true });
  await setDoc(doc(db, 'handlerNotes', 'hn1'), { memberId: jax, text: 'Solid on the run, a little loud on comms. Keep an eye on it.', by: kira, byName: 'Kira Lane', at: Timestamp.fromMillis(now - 60 * H) });
  await setDoc(doc(db, 'vouches', 'vc1'), { memberId: jax, kind: 'vouch', text: 'Held the left side at the docks all night.', by: ids['Rocco Vale'], byName: 'Rocco Vale', at: Timestamp.fromMillis(now - 38 * H) });
  await setDoc(doc(db, 'vouches', 'vc2'), { memberId: mia, kind: 'flag', text: 'Seen talking to Vagos at the taco truck.', by: ids['Tommy Reyes'], byName: 'Tommy Reyes', at: Timestamp.fromMillis(now - 4 * H) });
  await setDoc(doc(db, 'welcomeNotes', 'wn1'), { to: jax, text: 'Good work at the docks. Get that lab cook done and you\'re close.', by: kira, byName: 'Kira Lane', at: Timestamp.fromMillis(now - 20 * H) });
  await setDoc(doc(db, 'graduations', ids['Ghost']), { name: 'Ghost', rankName: 'Soldier', at: Timestamp.fromMillis(now - 30 * H) });

  // The Archives: dinner notes, the lore book, stories, a character page, a war, the timeline and reactions.
  const sal = ids['Sal Moretti'];
  const P2 = (names) => names.map((n) => ids[n]);
  const dn = (date, n, back) => setDoc(doc(db, 'dinnerNotes', date), { date, title: 'Family Dinner', present: [], excused: [], absent: [], topics: '', decisions: '', announcements: '', quote: '', quoteBy: '', minutes: '', ranks: [], status: 'published', by: sal, byName: 'Sal Moretti', at: Timestamp.fromMillis(now - back * H), publishedAt: Timestamp.fromMillis(now - back * H), ...n });
  await dn(sun(1), {
    present: P2(['Don Vito', 'Sal Moretti', 'Nico Bruno', 'Lena Russo', 'Marco Gallo', 'Rocco Vale', 'Dani Cruz', 'Ghost']), excused: P2(['Kira Lane']), absent: P2(['Tommy Reyes']),
    topics: 'The Don opened with the matter of the Ballas. After the van on Grove there would be no more talk. Rocco asked for the streets, and the table gave them to him.\n\nLena laid out the books: the clubhouse fund is a tenth of the way there, and the washers are behind.',
    decisions: 'War on the Ballas. A bounty of $50,000 on Tiny Loc.\n\nDues rise to $3,000 dirty for soldiers, starting next dinner.',
    announcements: 'Blacksite at the docks Friday, 9PM. Hit Squad leads.',
    quote: 'Loyalty is the only currency that never washes clean.', quoteBy: 'Don Vito',
    ranks: [{ memberId: ids['Ghost'], name: 'Ghost', rankName: 'Soldier', kind: 'promoted' }],
  }, 7 * 24 - 4);
  await dn(sun(2), {
    present: P2(['Don Vito', 'Sal Moretti', 'Nico Bruno', 'Lena Russo', 'Marco Gallo', 'Rocco Vale', 'Kira Lane']), absent: P2(['Dani Cruz']),
    topics: 'A quiet table. The Families asked for a sit-down, and the Don agreed to hear them.',
    decisions: 'One month of peace with the Families.',
    minutes: 'Marco brought the first harvest from the new grow. The room was in good spirits; Nico told the story of the Pillbox job again, and it got longer.',
  }, 14 * 24 - 4);
  await dn(sun(0), { status: 'draft', publishedAt: null, present: P2(['Don Vito', 'Sal Moretti', 'Rocco Vale']), topics: 'Notes in progress…' }, 2);
  const lo = (id, l, back) => setDoc(doc(db, 'lore', id), { kind: 'chapter', era: '', order: 0, memberId: null, gangId: null, credit: '', images: [], color: '#4a0f0c', status: 'published', reviewNote: '', by: sal, byName: 'Sal Moretti', at: Timestamp.fromMillis(now - back * H), publishedAt: Timestamp.fromMillis(now - back * H), ...l });
  await lo('ch1', { title: 'The Founding', order: 1, era: 'Before the gold · 2024', color: '#4a0f0c', body: 'Before there was a family, there were three men at a table in the back of a restaurant on Vespucci. Vito Moretti had the money, Sal had the head for it, and Nico had the nerve.\n\nThey swore on bread and blood that what was built would be shared, and that no one at the table would be left behind. That oath is the first law of the Chosen, and it has never been broken.\n\nThe first year was small: a garage, two cars, and a reputation that grew faster than the crew.' }, 900);
  await lo('ch2', { title: 'Grove Street Years', order: 2, era: '2025', color: '#0f1a2a', body: 'The family moved east when Marco found the grow house on Grove. It was there the family learned to cook, to wash, and to wait.\n\nIt was also there they learned who their neighbors were.' }, 600);
  await lo('ch3', { title: 'The Ballas War', order: 3, era: 'Autumn 2026', color: '#2a0f2a', body: 'It began with a van on Grove Street and forty bags gone into the night. By Sunday the table had decided, and by Monday Rocco had the streets.\n\nThe first night, the liquor store on Davis. The Ballas did not expect us to come to them.' }, 30);
  await lo('ch4', { title: 'The Clubhouse', order: 4, era: 'Coming', color: '#3a2a0c', status: 'draft', publishedAt: null, body: 'Draft. The fund, the place, the plan.' }, 3);
  await lo('st1', { kind: 'story', title: 'The Pillbox Job', credit: 'Nico Bruno', by: ids['Nico Bruno'], byName: 'Nico Bruno', color: '#1a2a14', body: 'Nobody believes it now, but there were only two of us and a stolen ambulance.\n\nWe were in and out in six minutes. The doctor still sends a card every Christmas.' }, 200);
  await lo('st2', { kind: 'story', title: 'Night at the docks', credit: 'Kira Lane', by: kira, byName: 'Kira Lane', status: 'submitted', publishedAt: null, color: '#14202a', body: 'I carried plates for six hours and never fired a shot. Rocco says that is why we won.' }, 5);
  await lo('cp1', { kind: 'character', title: 'The Hammer', memberId: ids['Rocco Vale'], color: '#1a1a1a', body: 'Rocco Vale came to the family with nothing but a borrowed pistol and a long memory. He never forgets a debt, and he never lets one go unpaid.\n\nWhen the war came, it was Rocco who asked for the streets.' }, 100);
  await lo('wr1', { kind: 'war', title: 'The van on Grove', gangId: 'ballas', color: '#2a0f2a', body: 'Forty bags, two purple Buffalos, and a driver who talked too much. That was the night the Ballas stopped being neighbors.' }, 28);
  const tl = (id, date, title, note) => setDoc(doc(db, 'timeline', id), { date, title, note, by: sal, at: Timestamp.fromMillis(now) });
  await tl('t1', '2024-03-14', 'The oath on Vespucci', 'Vito, Sal and Nico found the family.');
  await tl('t2', '2025-02-01', 'The move to Grove Street', 'Marco finds the grow house.');
  await tl('t3', '2025-09-20', 'First blacksite held', 'The docks, eleven hours.');
  for (const [who, emoji] of [['Don Vito', '👑'], ['Rocco Vale', '🩸'], ['Dani Cruz', '🔥'], ['Lena Russo', '🥃']]) await setDoc(doc(db, 'archiveReacts', `note:${sun(1)}_${ids[who]}`), { target: `note:${sun(1)}`, memberId: ids[who], emoji });

  // Honors: the catalog sets itself up when High Table signs in; a few given honors and loadouts to show off.
  const ho = (who, honorId, by, byName, note, back, seen = true) => setDoc(doc(db, 'honorsOwned', `${ids[who]}_${honorId}`), { memberId: ids[who], honorId, by, byName, note, seen, at: Timestamp.fromMillis(now - back * H) });
  await ho('Don Vito', 't-oath', sal, 'Sal Moretti', 'For the oath on Vespucci.', 400);
  await ho('Don Vito', 'e-bleeding', sal, 'Sal Moretti', '', 300);
  await ho('Don Vito', 'f-covenant', sal, 'Sal Moretti', '', 300);
  await ho('Rocco Vale', 't-righthand', vito, 'Don Vito', 'Took the streets.', 30, false);
  await ho('Rocco Vale', 'f-crown', 'milestone', '', '', 50);
  await ho('Rocco Vale', 'h-blood', 'milestone', '', '', 50);
  await ho('Rocco Vale', 'mvp', 'milestone', '', '', 60);
  await ho('Rocco Vale', 'first-blood', 'milestone', '', '', 200);
  await ho('Rocco Vale', 'body-count', 'milestone', '', '', 40);
  await ho('Rocco Vale', 'e-smolder', 'milestone', '', '', 20);
  await ho('Kira Lane', 't-favorite', sal, 'Sal Moretti', 'Never dropped a plate.', 10);
  await ho('Kira Lane', 'h-royal', 'milestone', '', '', 15);
  await ho('Kira Lane', 'f-roses', 'milestone', '', '', 15);
  await ho('Kira Lane', 'e-shimmer', 'milestone', '', '', 15);
  await setDoc(doc(db, 'honorLoadouts', vito), { title: 't-oath', frame: 'f-covenant', effect: 'e-bleeding', nameHue: null, accentHue: null, trimHue: null, backdropHue: null, showcase: [] });
  await setDoc(doc(db, 'honorLoadouts', ids['Rocco Vale']), { title: 't-righthand', frame: 'f-crown', effect: 'e-smolder', nameHue: 'h-blood', accentHue: null, trimHue: null, backdropHue: 'h-blood', showcase: ['body-count', 'mvp', 'first-blood'] });
  await setDoc(doc(db, 'honorLoadouts', kira), { title: 't-favorite', frame: 'f-roses', effect: 'e-shimmer', nameHue: 'h-royal', accentHue: 'h-royal', trimHue: null, backdropHue: 'h-royal', showcase: [] });

  // The casino: stacks, a few records, a gift on the way.
  const wkNow = (() => { const d = new Date(now); const day = (d.getUTCDay() + 6) % 7; return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10); })();
  const ch = (who, c) => setDoc(doc(db, 'chips', ids[who]), { lastWeekly: wkNow, lastDaily: new Date(now).toISOString().slice(0, 10), paidFor: { runs: 0, fights: 0, dinners: 0 }, honorsPaid: [], hands: 0, chipsWon: 0, biggestWin: 0, blackjacks: 0, jackpots: 0, week: wkNow, weekNet: 0, ...c });
  await ch('Don Vito', { balance: 24500, hands: 340, chipsWon: 41000, biggestWin: 8000, blackjacks: 12, jackpots: 1, weekNet: 3200 });
  await ch('Rocco Vale', { balance: 9100, hands: 120, chipsWon: 12000, biggestWin: 2400, blackjacks: 4, weekNet: 1800 });
  await ch('Kira Lane', { balance: 3400, hands: 60, chipsWon: 4100, biggestWin: 900, weekNet: -300 });
  await ch('Nico Bruno', { balance: 15200, hands: 210, chipsWon: 22000, biggestWin: 5000, blackjacks: 7, weekNet: 600 });
  await setDoc(doc(db, 'chipGifts', 'cg1'), { to: ids['Kira Lane'], from: vito, fromName: 'Don Vito', amount: 1000, reason: 'For the plates at the docks', grant: true, claimed: false, at: Timestamp.fromMillis(now - H) });

  // Rivals: case files, members, incidents, notes, sightings, bounties and the red-string board.
  const mug = (bg, fg) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="${bg}"/><circle cx="80" cy="62" r="30" fill="${fg}"/><path d="M24 160c4-38 28-56 56-56s52 18 56 56z" fill="${fg}"/></svg>`);
  const logo = (c, t) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#111"/><text x="80" y="104" fill="${c}" font-family="serif" font-weight="bold" font-size="72" text-anchor="middle">${t}</text></svg>`);
  const sq = (pts) => pts.map(([x, y]) => ({ x, y }));
  const rv = (id, r) => setDoc(doc(db, 'rivals', id), { logo: null, relationLog: [], zones: [], cars: [], notes: '', at: Timestamp.fromMillis(now - 200 * H), ...r });
  await rv('ballas', {
    name: 'Ballas', color: '#a855f7', logo: logo('#a855f7', 'B'), relation: 'war', size: 14, danger: 4, weapons: 'SMGs, two or three rifles',
    turfNote: 'Grove and the Davis projects', hangouts: 'The liquor store on Davis, Chamberlain basketball court',
    cars: [{ model: 'Buffalo', plate: '42BLS117', color: 'Purple' }, { model: 'Baller', plate: '88PRP003', color: 'Black' }],
    notes: 'Run crack out of the projects. Push hard at night, go quiet by day. Their OG never rolls without two cars.',
    zones: [{ label: 'Davis', points: sq([[0.42, 0.68], [0.5, 0.66], [0.53, 0.75], [0.44, 0.78]]) }],
    relationLog: [{ rel: 'war', note: 'Hit our van on Grove. No more talking.', by: 'Don Vito', at: now - 30 * H }, { rel: 'tense', note: 'Words at the docks', by: 'Don Vito', at: now - 160 * H }],
  });
  await rv('vagos', {
    name: 'Vagos', color: '#eab308', logo: logo('#eab308', 'V'), relation: 'hostile', size: 10, danger: 3, weapons: 'Pistols, a few shotguns',
    turfNote: 'El Burro Heights and Rancho', hangouts: 'Taco truck on Jamestown',
    zones: [{ label: 'Rancho', points: sq([[0.56, 0.7], [0.64, 0.68], [0.66, 0.78], [0.57, 0.8]]) }],
    relationLog: [{ rel: 'hostile', note: 'Took the docks from us yesterday', by: 'Lena Russo', at: now - 25 * H }],
  });
  await rv('families', { name: 'Families', color: '#22c55e', logo: logo('#22c55e', 'F'), relation: 'truce', size: 18, danger: 2, turfNote: 'Forum Drive', hangouts: 'Forum Dr cul-de-sac', relationLog: [{ rel: 'truce', note: 'Sit-down at the diner, no hits for a month', by: 'Don Vito', at: now - 70 * H }] });
  await rv('lost', { name: 'Lost MC', color: '#94a3b8', relation: 'neutral', size: 8, danger: 3, turfNote: 'Sandy Shores clubhouse', hangouts: 'Yellow Jack Inn' });
  const rm = (g, id, m) => setDoc(doc(db, 'rivals', g, 'members', id), { photo: null, notes: '', lastSeenAt: null, lastSeenWhere: '', ...m });
  await rm('ballas', 'b1', { name: 'Tiny Loc', role: 'OG', threat: 'kos', photo: mug('#2b1240', '#8b5cf6'), lastSeenAt: Timestamp.fromMillis(now - 2 * H), lastSeenWhere: 'postal 8042' });
  await rm('ballas', 'b2', { name: 'Smoke', role: 'Shooter', threat: 'high', photo: mug('#24123a', '#a78bfa') });
  await rm('ballas', 'b3', { name: 'Lil Dre', role: 'Runner', threat: 'medium' });
  await rm('ballas', 'b4', { name: 'Keisha', role: 'Driver', threat: 'low', photo: mug('#1f1430', '#c4b5fd') });
  await rm('vagos', 'v1', { name: 'El Toro', role: 'Jefe', threat: 'high', photo: mug('#3a2e06', '#eab308') });
  await rm('vagos', 'v2', { name: 'Chuy', role: 'Shooter', threat: 'medium' });
  await rm('families', 'f1', { name: 'Big Mike', role: 'Leader', threat: 'low', photo: mug('#0f2a17', '#22c55e') });
  const ri = (id, i, back) => setDoc(doc(db, 'rivalIncidents', id), { notes: '', where: '', outcome: null, by: ids['Rocco Vale'], byName: 'Rocco Vale', at: Timestamp.fromMillis(now - back * H), ...i });
  await ri('ri1', { gangId: 'ballas', kind: 'robbery', title: 'Hit our product van on Grove', where: 'Grove St', outcome: 'loss', notes: 'Took 40 bags of meth. Two purple Buffalos.' }, 31);
  await ri('ri2', { gangId: 'ballas', kind: 'fight', title: 'Shootout at the liquor store', where: 'Davis', outcome: 'win' }, 12);
  await ri('ri3', { gangId: 'families', kind: 'deal', title: 'Sit-down at the diner', where: 'Vespucci', outcome: 'draw', notes: 'One month truce.', by: vito, byName: 'Don Vito' }, 70);
  await ri('ri4', { gangId: 'vagos', kind: 'turf', title: 'Tagged our wall in La Mesa', where: 'La Mesa' }, 6);
  await setDoc(doc(db, 'rivalNotes', 'rn1'), { gangId: 'ballas', text: 'Tiny Loc keeps a stash in the back of the Davis liquor store.', by: ids['Kira Lane'], byName: 'Kira Lane', at: Timestamp.fromMillis(now - 20 * H) });
  await setDoc(doc(db, 'rivalNotes', 'rn2'), { gangId: 'ballas', text: 'Smoke owes the Vagos money. Could use that.', by: ids['Dani Cruz'], byName: 'Dani Cruz', at: Timestamp.fromMillis(now - 8 * H) });
  const sg = (id, s, back) => setDoc(doc(db, 'sightings', id), { memberIds: [], postal: '', x: null, y: null, note: '', by: ids['Tommy Reyes'], byName: 'Tommy Reyes', at: Timestamp.fromMillis(now - back * H), ...s });
  await sg('sg1', { gangId: 'ballas', memberIds: ['b1', 'b2'], postal: '8042', x: 0.47, y: 0.72, note: 'Two cars outside the liquor store, strapped' }, 2);
  await sg('sg2', { gangId: 'vagos', memberIds: ['v1'], postal: '9011', x: 0.6, y: 0.74, note: 'Buying at the taco truck' }, 0.5);
  await sg('sg3', { gangId: 'lost', postal: '1012', note: 'Bikes parked at the Yellow Jack' }, 20);
  await setDoc(doc(db, 'bounties', 'bt1'), { gangId: 'ballas', memberId: 'b1', memberName: 'Tiny Loc', photo: mug('#2b1240', '#8b5cf6'), amount: 50000, cash: 'dirty', reason: 'Ordered the hit on our van', status: 'open', claimBy: null, claimName: null, claimProof: null, claimAt: null, by: vito, at: Timestamp.fromMillis(now - 20 * H) });
  await setDoc(doc(db, 'bounties', 'bt2'), { gangId: 'ballas', memberId: 'b2', memberName: 'Smoke', photo: mug('#24123a', '#a78bfa'), amount: 20000, cash: 'dirty', reason: 'Shooter on Grove', status: 'claimed', claimBy: ids['Rocco Vale'], claimName: 'Rocco Vale', claimProof: 'Dropped him behind the liquor store at 11pm, clip in #blacksites', claimAt: Timestamp.fromMillis(now - H), by: vito, at: Timestamp.fromMillis(now - 18 * H) });
  await setDoc(doc(db, 'bounties', 'bt3'), { gangId: 'vagos', memberId: 'v1', memberName: 'El Toro', photo: mug('#3a2e06', '#eab308'), amount: 35000, cash: 'clean', reason: 'Took the docks', status: 'open', claimBy: null, claimName: null, claimProof: null, claimAt: null, by: vito, at: Timestamp.fromMillis(now - 5 * H) });
  await setDoc(doc(db, 'rivalBoard', 'main'), {
    nodes: [
      { id: 'n1', kind: 'gang', ref: 'ballas', label: 'Ballas', color: '#a855f7', x: 0.2, y: 0.2 },
      { id: 'n2', kind: 'gang', ref: 'vagos', label: 'Vagos', color: '#eab308', x: 0.8, y: 0.2 },
      { id: 'n3', kind: 'member', ref: 'ballas/b1', label: 'Tiny Loc', color: '#dc2626', x: 0.18, y: 0.6 },
      { id: 'n4', kind: 'member', ref: 'ballas/b2', label: 'Smoke', color: '#f97316', x: 0.45, y: 0.5 },
      { id: 'n5', kind: 'member', ref: 'vagos/v1', label: 'El Toro', color: '#f97316', x: 0.78, y: 0.62 },
      { id: 'n6', kind: 'note', ref: '', label: "Who's supplying the Ballas guns?", x: 0.5, y: 0.85 },
      { id: 'n7', kind: 'gang', ref: 'families', label: 'Families', color: '#22c55e', x: 0.5, y: 0.15 },
    ],
    links: [
      { a: 'n3', b: 'n1', color: '#eab308' },
      { a: 'n4', b: 'n1', color: '#eab308' },
      { a: 'n4', b: 'n5', color: '#38bdf8' },
      { a: 'n1', b: 'n2', color: '#dc2626' },
      { a: 'n3', b: 'n6', color: '#38bdf8' },
      { a: 'n7', b: 'n1', color: '#dc2626' },
    ],
    legend: [
      { color: '#dc2626', meaning: 'Beef / enemies' },
      { color: '#22c55e', meaning: 'Allies / work together' },
      { color: '#eab308', meaning: 'Family / close' },
      { color: '#38bdf8', meaning: 'Business / owes money' },
    ],
  });

  // Admin: editable lists, a price history, the feed, and a welcome note.
  await setDoc(doc(db, 'settings', 'lists'), {
    crimes: [
      { id: 'delivery', name: 'Delivery', icon: 'package', rep: 15, cash: 1200 },
      { id: 'vehicle', name: 'Vehicle', icon: 'car', rep: 25, cash: 2500 },
      { id: 'arson', name: 'Arson', icon: 'flame', rep: 30 },
      { id: 'assassination', name: 'Assassination', icon: 'crosshair', rep: 60, cash: 5000 },
      { id: 'special', name: 'Special', icon: 'star' },
      { id: 'heist', name: 'Store Heist', icon: 'store', rep: 40, cash: 4000 },
    ],
    products: [{ id: 'p_lockpicks', name: 'Lockpicks', unit: 'pick', itemId: 'lockpick' }],
  });
  const pl = (id, product, was, price, back) => setDoc(doc(db, 'priceLog', id), { product, was, price, by: vito, byName: 'Don Vito', at: Timestamp.fromMillis(now - back * H) });
  await pl('pl0', 'meth', 22000, 25000, 50);
  await pl('pl1', 'dosidos', 21000, 19000, 30);
  await pl('pl2', 'p_lockpicks', 0, 400, 2);
  const fd = (id, kind, text, back, extra = {}) => setDoc(doc(db, 'adminFeed', id), { kind, text, by: vito, byName: 'Don Vito', target: null, reason: '', at: Timestamp.fromMillis(now - back * H), ...extra });
  await fd('fd0', 'join', 'Let Ghost in as Associate', 49, { target: ids['Ghost'] });
  await fd('fd1', 'rank', 'Promoted Rocco Vale to Lieutenant', 5, { target: ids['Rocco Vale'] });
  await fd('fd2', 'price', 'Changed 1 BlackMarket price (Lockpicks $400)', 2);
  await fd('fd3', 'fix', "Fixed Tommy Reyes's petty rep (120 → 95)", 1, { target: ids['Tommy Reyes'], reason: 'Logged the same session twice' });
  await fd('fd4', 'list', 'Updated the petty crime types (Delivery, Vehicle, Arson, Assassination, Special, Store Heist)', 0.5);
  await setDoc(doc(db, 'welcomes', ids['Ghost']), { text: 'Glad to have you. Ask Rocco for your first run.', by: vito, byName: 'Don Vito', at: Timestamp.fromMillis(now - 49 * H) });
  // Parties today: Kira's birthday and Rocco's first year in the family (Eastern time).
  const etNow = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  await setDoc(doc(db, 'members', ids['Kira Lane']), { birthday: `${etNow.month}-${etNow.day}` }, { merge: true });
  await setDoc(doc(db, 'members', ids['Rocco Vale']), { joinedAt: Timestamp.fromDate(new Date(`${+etNow.year - 1}-${etNow.month}-${etNow.day}T18:00:00Z`)) }, { merge: true });
  const pn = (party, forWho, kind, label, who, text, back) =>
    setDoc(doc(db, 'partyNotes', `${party}_${ids[who]}`), { party, for: ids[forWho], kind, label, by: ids[who], name: who, text, at: Timestamp.fromMillis(now - back * H) });
  await pn(`birthday_${ids['Kira Lane']}_${etNow.year}`, 'Kira Lane', 'birthday', 'Birthday', 'Rocco Vale', 'Happy birthday, kid. Drinks on me at the Yellow Jack.', 3);
  await pn(`birthday_${ids['Kira Lane']}_${etNow.year}`, 'Kira Lane', 'birthday', 'Birthday', 'Dani Cruz', 'HBD! Best driver we got 🎂', 2);
  await pn(`anniversary_${ids['Rocco Vale']}_${etNow.year}-${etNow.month}-${etNow.day}`, 'Rocco Vale', 'anniversary', '1 year in the family', 'Don Vito', 'A year already. Proud to have you, Hammer.', 1);
  await pn(`birthday_${ids['Tommy Reyes']}_${+etNow.year - 1}`, 'Tommy Reyes', 'birthday', 'Birthday', 'Kira Lane', 'Happy birthday Tank!', 24 * 200);
  // Radio channels (demo values only; the real ones are set in the app).
  await setDoc(doc(db, 'radio', 'associate'), { freq: '555.12', password: 'demo-assoc', note: 'Stay on this until you are blooded in.', byName: 'Kira Lane', at: Timestamp.now() });
  await setDoc(doc(db, 'radio', 'main'), { freq: '777.07', password: 'demo-family', note: '', byName: 'Don Vito', at: Timestamp.now() });
  await setDoc(doc(db, 'radio', 'heist'), { freq: '913.13', password: 'demo-heist', note: 'Fleeca job tonight. Stay off it otherwise.', active: true, byName: 'Don Vito', at: Timestamp.now() });
  // Heists: one live, one planned, one done.
  const hz = (id, h, back) => setDoc(doc(db, 'heists', id), { notes: '', size: 4, when: null, requests: {}, crew: [], roles: {}, status: 'planned', outcome: null, take: 0, cashGiven: {}, cashCollected: {}, banked: false, report: '', stashTo: 'main', by: vito, byName: 'Don Vito', at: Timestamp.fromMillis(now - back * H), liveAt: null, doneAt: null, ...h });
  const ask = (role, note = '') => ({ role, note, at: now - 5 * H });
  await hz('hz1', {
    name: 'Friday Fleeca', target: 'Fleeca bank', status: 'live', when: Timestamp.fromMillis(now - 0.3 * H), liveAt: Timestamp.fromMillis(now - 0.3 * H),
    requests: { [ids['Rocco Vale']]: ask('Driller'), [ids['Dani Cruz']]: ask('Driver', 'Sultan is tuned'), [ids['Kira Lane']]: ask('Lookout'), [ids['Ghost']]: ask('Hacker', 'Can do the panel if needed') },
    crew: ['Rocco Vale', 'Dani Cruz', 'Kira Lane'].map((n) => ids[n]),
    roles: { [ids['Rocco Vale']]: 'Driller', [ids['Dani Cruz']]: 'Driver', [ids['Kira Lane']]: 'Lookout' },
    notes: 'Rocco drills, Dani drives the Sultan, Kira on the door. Meet at the pier.',
  }, 20);
  await hz('hz2', {
    name: 'Paleto score', target: 'Paleto bank', size: 6, when: Timestamp.fromMillis(now + 50 * H),
    requests: { [ids['Nico Bruno']]: ask('Gunman'), [ids['Ghost']]: ask('Hacker', 'Bringing the laptop'), [ids['Dani Cruz']]: ask('Driver') },
    crew: [ids['Nico Bruno']], roles: { [ids['Nico Bruno']]: 'Gunman' },
    notes: 'Need two shooters and a boat.',
  }, 10);
  await hz('hz3', {
    name: 'Vangelico smash', target: 'Jewelry store', status: 'done', outcome: 'success', take: 284000, report: 'In and out in 90 seconds.',
    crew: ['Rocco Vale', 'Tommy Reyes', 'Kira Lane'].map((n) => ids[n]),
    roles: { [ids['Rocco Vale']]: 'Gunman', [ids['Tommy Reyes']]: 'Driver', [ids['Kira Lane']]: 'Hacker' },
    cashGiven: { [ids['Rocco Vale']]: 60000, [ids['Kira Lane']]: 45000 }, cashCollected: { [ids['Rocco Vale']]: 60000 },
    doneAt: Timestamp.fromMillis(now - 70 * H),
  }, 80);
  await setDoc(doc(db, 'heists', 'hz3', 'loot', 'l1'), { item: 'lockpick', label: 'Lockpick', qty: 6, assigned: { [ids['Kira Lane']]: 2 }, collected: {} });
  await hz('hz4', {
    name: 'Humane Labs breach', target: 'Humane Labs', status: 'done', outcome: 'failed', take: 0, report: 'Alarm tripped on the second door. Everyone made it out.',
    crew: ['Rocco Vale', 'Kira Lane'].map((n) => ids[n]), roles: { [ids['Rocco Vale']]: 'Gunman', [ids['Kira Lane']]: 'Driver' }, banked: true,
    doneAt: Timestamp.fromMillis(now - 200 * H),
  }, 220);
  // Polls: a dinner spot, a scheduling poll, a sealed motion still open, and a closed official one.
  const opt = (...l) => ({ options: l.map((label, i) => ({ id: String.fromCharCode(97 + i), label })), ids: l.map((_, i) => String.fromCharCode(97 + i)) });
  const poll = (id, p, back) => setDoc(doc(db, 'polls', id), { note: '', audience: 'members', anonymous: false, reveal: 'live', official: false, closesAt: null, status: 'open', voters: [], logged: false, by: vito, byName: 'Don Vito', at: Timestamp.fromMillis(now - back * H), ...p });
  const named = async (pid, who, picks) => {
    await setDoc(doc(db, 'polls', pid, 'votes', ids[who]), { picks, memberId: ids[who], name: who, at: Timestamp.fromMillis(now - H) });
    await setDoc(doc(db, 'pollBallots', `${pid}_${ids[who]}`), { pollId: pid, memberId: ids[who], voteId: ids[who], at: Timestamp.fromMillis(now - H) });
  };
  const anon = async (pid, who, picks, n) => {
    await setDoc(doc(db, 'polls', pid, 'votes', `${pid}v${n}`), { picks, at: Timestamp.fromMillis(now - H) });
    await setDoc(doc(db, 'pollBallots', `${pid}_${ids[who]}`), { pollId: pid, memberId: ids[who], voteId: `${pid}v${n}`, at: Timestamp.fromMillis(now - H) });
  };
  await poll('pl1', { question: "Where's family dinner this Sunday?", note: 'Booking closes Saturday night.', kind: 'single', ...opt('Pearls by the pier', 'Bahama Mamas', 'The Yellow Jack', 'Vito\'s place'), closesAt: Timestamp.fromMillis(now + 30 * H), voters: ['Sal Moretti', 'Rocco Vale', 'Dani Cruz', 'Tommy Reyes', 'Lena Russo'].map((n) => ids[n]) }, 5);
  for (const [who, pick] of [['Sal Moretti', 'a'], ['Rocco Vale', 'c'], ['Dani Cruz', 'a'], ['Tommy Reyes', 'a'], ['Lena Russo', 'b']]) await named('pl1', who, [pick]);
  const slot = (d, h) => { const x = new Date(now); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  await poll('pl2', { question: 'When do we hit the Paleto bank?', note: 'Tick every time you can make. Need 6 minimum.', kind: 'dates', ...opt(slot(1, 21), slot(2, 20), slot(3, 22), slot(4, 21)), audience: 'all', closesAt: Timestamp.fromMillis(now + 50 * H), voters: ['Rocco Vale', 'Kira Lane', 'Nico Bruno'].map((n) => ids[n]) }, 3);
  await named('pl2', 'Rocco Vale', ['a', 'c']);
  await named('pl2', 'Kira Lane', ['a', 'b', 'c']);
  await named('pl2', 'Nico Bruno', ['c']);
  await poll('pl3', { question: 'Motion: declare war on the Ballas', note: "After the van hit on Grove. If it carries, it's KOS on sight from Monday.", kind: 'yesno', ...opt('Yes', 'No', 'Abstain'), anonymous: true, reveal: 'closed', official: true, closesAt: Timestamp.fromMillis(now + 70 * H), voters: ['Sal Moretti', 'Rocco Vale', 'Marco Gallo'].map((n) => ids[n]) }, 2);
  await anon('pl3', 'Sal Moretti', ['b'], 1);
  await anon('pl3', 'Rocco Vale', ['a'], 2);
  await anon('pl3', 'Marco Gallo', ['a'], 3);
  await poll('pl4', { question: 'Motion: one-month truce with the Families', kind: 'yesno', ...opt('Yes', 'No', 'Abstain'), anonymous: true, reveal: 'closed', official: true, status: 'closed', closedAt: Timestamp.fromMillis(now - 60 * H), logged: true, voters: ['Sal Moretti', 'Rocco Vale', 'Marco Gallo', 'Dani Cruz', 'Lena Russo', 'Kira Lane'].map((n) => ids[n]) }, 90);
  for (const [i, [who, pick]] of [['Sal Moretti', 'a'], ['Rocco Vale', 'b'], ['Marco Gallo', 'a'], ['Dani Cruz', 'a'], ['Lena Russo', 'a'], ['Kira Lane', 'c']].entries()) await anon('pl4', who, [pick], i);
  await setDoc(doc(db, 'polls/pl4/comments/c1'), { by: ids['Rocco Vale'], name: 'Rocco Vale', text: "Truce with them means we can focus on the Ballas. I'm still voting no.", at: Timestamp.fromMillis(now - 80 * H) });
  await setDoc(doc(db, 'polls/pl1/comments/c1'), { by: ids['Rocco Vale'], name: 'Rocco Vale', text: 'Yellow Jack has the pool table. Just saying.', at: Timestamp.fromMillis(now - 4 * H) });
  await setDoc(doc(db, 'pollTemplates', 'pt1'), { name: 'Dinner spot', question: "Where's family dinner this Sunday?", note: '', kind: 'single', options: ['Pearls by the pier', 'Bahama Mamas', 'The Yellow Jack'], audience: 'members', anonymous: false, reveal: 'live', official: false, hours: 48 });
  await setDoc(doc(db, 'settings/gang'), { name: 'The Chosen', motto: 'Chosen by blood. Bound in gold.' });
  await setDoc(doc(db, 'settings/announcement'), {
    text: 'Blacksite at the docks Friday 9PM ET. Hit Squad leads, everyone else on standby. Bring armor.',
    by: ids['Don Vito'],
    at: Timestamp.fromMillis(now - 2 * 3600_000),
  });
});
await env.cleanup();
console.log(`Seeded ${PEOPLE.length + 1} members. Sign in as "Don Vito" / ${PIN}.`);
