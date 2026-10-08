// Moves NoelOps' data out of its old, open database into the HQ's own Realtime Database (behind
// database.rules.json), once. Run it from the Actions tab (Move NoelOps) at a quiet time, right after the old
// database has been made read-only, so nothing changes during the copy.
//
//   node scripts/move-noelops.mjs                      # into the local emulators (demo data)
//   node scripts/move-noelops.mjs --live [--dry-run]   # into chosenops (needs GOOGLE_APPLICATION_CREDENTIALS)
//
// What it does:
// - copies everything under `noelops/` except who-was-online
// - takes the PINs out of NoelOps' crew list (sign-in is HQ's now; names stay so stats keep matching)
// - moves the Discord webhook to `private/webhookUrl`, where only leadership can read it
// - writes the access list from HQ ranks and roles (leadership manages, Narco edits, other blooded members see
//   stash houses and stats), the same way leadership's HQ pages keep it up to date afterwards
// - lists NoelOps crew who won't get in, so leadership can set them up in HQ
import { appendFileSync, readFileSync } from 'node:fs';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const live = args.includes('--live');
const dry = args.includes('--dry-run');
const force = args.includes('--force');
const from = args.find((a) => a.startsWith('--from='))?.slice(7) ?? 'https://noelops-default-rtdb.firebaseio.com/noelops.json';

const NS = live ? 'chosenops-default-rtdb' : 'demo-chosenops-default-rtdb';
initializeApp(
  live
    ? { credential: applicationDefault(), projectId: 'chosenops', databaseURL: `https://${NS}.firebaseio.com` }
    : { projectId: 'demo-chosenops', databaseURL: `http://127.0.0.1:9000?ns=${NS}` },
);
if (!live) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  process.env.FIREBASE_DATABASE_EMULATOR_HOST ??= '127.0.0.1:9000';
}
const fs = getFirestore();
const rtdb = getDatabase();
const say = (s = '') => {
  console.log(s);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${s}\n`);
};
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// 1. The old data
let old;
if (/^https?:/.test(from)) {
  const res = await fetch(from);
  if (!res.ok) throw new Error(`Couldn't read the old NoelOps database (${res.status}). Is it readable?`);
  old = await res.json();
} else old = JSON.parse(readFileSync(from, 'utf8'));
if (!isObj(old) || !(isObj(old.stock) || isObj(old.noelops?.stock))) throw new Error('The old database has no stock: refusing to copy an empty or broken database.');

const already = (await rtdb.ref('noelops/stock').get()).exists();
if (already && !force && !dry) throw new Error('The new database already has NoelOps data. Run with --force to copy over it.');

// A nightly backup holds { noelops, private }; the old database holds NoelOps' sections directly.
const fromBackup = isObj(old.noelops);
const data = structuredClone(fromBackup ? old.noelops : old);
delete data.presence;
const webhookUrl = fromBackup
  ? (old.private?.webhookUrl ?? '')
  : isObj(data.settings) && typeof data.settings.webhookUrl === 'string' ? data.settings.webhookUrl.trim() : '';
if (isObj(data.settings)) {
  delete data.settings.webhookUrl;
  data.settings.discordOn = !!webhookUrl;
}
const crew = isObj(data.crew) ? data.crew : {};
for (const m of Object.values(crew)) if (isObj(m)) delete m.pinHash;

// 2. The access list, from HQ ranks and roles
const [members, ranks, holders] = await Promise.all(['members', 'hqRanks', 'roleHolders'].map((c) => fs.collection(c).get()));
const rankById = new Map(ranks.docs.map((d) => [d.id, d.data()]));
const holderOf = new Map(holders.docs.map((d) => [d.id, d.data()]));
const access = {};
const byName = new Map();
for (const d of members.docs) {
  const m = { id: d.id, ...d.data() };
  if (m.status !== 'active') continue;
  const rank = rankById.get(m.rankId ?? '');
  const h = holderOf.get(m.id);
  const lead = m.admin === true || (!!rank && (rank.order === 0 || !!rank.leadership)) || h?.lead === true;
  const ops = m.admin === true || !!rank && (rank.order === 0 || rank.permissions?.manageOps === true) || h?.perms?.manageOps === true;
  let lvl = null;
  if (lead) lvl = 'manage';
  else if (m.rankId === 'associate') lvl = null;
  else if ((h?.roles ?? []).includes('narco')) lvl = 'edit';
  else lvl = 'member';
  if (!lvl) continue;
  // Inside NoelOps they go by the name leadership linked (often a first name), so their stats carry on.
  const noelName = (typeof m.noelName === 'string' && m.noelName.trim()) || m.name;
  const e = { m: m.id, n: noelName, lvl, ...(ops ? { ops: true } : {}) };
  access[m.authUid || m.id] = e;
  byName.set(String(noelName).trim().toLowerCase(), e);
  byName.set(String(m.name).trim().toLowerCase(), byName.get(String(m.name).trim().toLowerCase()) ?? e);
}

// 3. Who from NoelOps' crew won't get in
const left = Object.values(crew)
  .filter((c) => isObj(c) && c.name)
  .map((c) => ({ name: c.name, e: byName.get(String(c.name).trim().toLowerCase()) }))
  .filter(({ e }) => !e || e.lvl === 'member');

say('## NoelOps move');
say(`- Copying ${Object.keys(data).length} sections (${Object.keys(data.locations ?? {}).length} grows, ${Object.keys(data.stashes ?? {}).length} stash houses, ${Object.keys(data.activity ?? {}).length} activity lines)`);
say(`- Discord webhook: ${webhookUrl ? 'moved to the leadership-only spot' : 'none set'}`);
say(`- Access list: ${Object.values(access).filter((e) => e.lvl === 'manage').length} leadership, ${Object.values(access).filter((e) => e.lvl === 'edit').length} Narco, ${Object.values(access).filter((e) => e.lvl === 'member').length} other members`);
if (left.length) {
  say('');
  say('### NoelOps crew who won\'t get in yet');
  say('Link each one in HQ: Admin → Integrations → NoelOps names (type the name they use here), and give them the Narco role:');
  for (const { name, e } of left) say(`- ${name}: ${e ? 'linked, but no Narco role' : 'not linked to anyone in HQ yet'}`);
}

if (dry) {
  say('');
  say('_Dry run: nothing written._');
  process.exit(0);
}
await rtdb.ref().update({ noelops: data, access, 'private/webhookUrl': webhookUrl || null });
say('');
say('Done. NoelOps now reads and writes the new database.');
process.exit(0);
