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
  await ev('e2', 'Rocco Vale', 'Docks blacksite', 'blacksite', at(3, 21), 120, 'none', 'gang', { place: 'Docks blacksite', pinId: 'spot:sp_docks', note: 'Hit Squad leads, everyone else on standby. Bring armor.', rsvp: { [ids['Rocco Vale']]: 'yes', [ids['Dani Cruz']]: 'yes', [ids['Tommy Reyes']]: 'yes', [ids['Kira Lane']]: 'maybe' } });
  await ev('e3', 'Don Vito', 'Leadership: territory talk', 'meeting', at(1, 19), 60, 'none', 'limited', { ranks: LEAD, note: 'Leadership only.' });
  await ev('e4', 'Marco Gallo', 'Coca leaves harvest', 'op', at(-2, 18), 60, 'weekly', 'limited', { ranks: LEAD, crewIds: ['grow'] });
  await ev('e5', 'Lena Russo', 'Payout day', 'other', at(-5, 17), 30, 'biweekly', 'gang', { place: 'Laundromat' });
  await ev('e8', 'Don Vito', 'Buyer meet', 'meeting', at(2, 22), 30, 'none', 'gang', { place: 'Pier meet', pinId: 'p8' });
  await ev('e9', 'Sal Moretti', 'Quick sit-down', 'meeting', Timestamp.fromMillis(now + 40 * 60_000), 30, 'none', 'gang', { place: 'Pier meet', pinId: 'p8', rsvp: { [ids['Sal Moretti']]: 'yes', [ids['Don Vito']]: 'yes', [ids['Rocco Vale']]: 'maybe' } });
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
  await setDoc(doc(db, 'settings/gang'), { name: 'The Chosen', motto: 'Chosen by blood. Bound in gold.' });
  await setDoc(doc(db, 'settings/announcement'), {
    text: 'Blacksite at the docks Friday 9PM ET. Hit Squad leads, everyone else on standby. Bring armor.',
    by: ids['Don Vito'],
    at: Timestamp.fromMillis(now - 2 * 3600_000),
  });
});
await env.cleanup();
console.log(`Seeded ${PEOPLE.length + 1} members and 4 crews. Sign in as "Don Vito" / ${PIN}.`);
