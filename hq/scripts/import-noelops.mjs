// Brings NoelOps data (its Realtime Database JSON) into the HQ's Firestore.
//
//   node scripts/import-noelops.mjs --from noelops.json            # into the local emulators
//   node scripts/import-noelops.mjs --from <url or file> --live     # into chosenops (needs GOOGLE_APPLICATION_CREDENTIALS)
//
// Options:
//   --only=stock,places,sales,history,yields,activity,stats   pick sections (default: all)
//   --dry-run                                                  print what would be written, write nothing
//
// Safe to run again: every document gets a fixed id (noel_…), so a re-run overwrites its own
// earlier import instead of doubling it. Re-run `--only=sales,stats` after members have signed up,
// to link sales and work counters to them by name. Stock is only written with --only=stock or on a
// first run (when the Main Stash has no stock yet), so live stock is never overwritten by accident.
import { readFileSync } from 'node:fs';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const arg = (k) => {
  const a = args.find((x) => x === `--${k}` || x.startsWith(`--${k}=`));
  if (!a) return undefined;
  if (a.includes('=')) return a.split('=').slice(1).join('=');
  const i = args.indexOf(a);
  return args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
};
const from = arg('from');
const live = !!arg('live');
const dry = !!arg('dry-run');
const only = typeof arg('only') === 'string' ? new Set(arg('only').split(',')) : null;
const want = (s) => !only || only.has(s);
if (!from) {
  console.error('Usage: node scripts/import-noelops.mjs --from <file|url> [--live] [--only=…] [--dry-run]');
  process.exit(1);
}

if (!live) process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
initializeApp(live ? { credential: applicationDefault(), projectId: 'chosenops' } : { projectId: 'demo-chosenops' });
const db = getFirestore();

const data = from.startsWith('http') ? await (await fetch(from.endsWith('.json') ? from : `${from.replace(/\/$/, '')}/.json`)).json() : JSON.parse(readFileSync(from, 'utf8'));
if (!data || typeof data !== 'object') throw new Error('No NoelOps data found.');

const STRAINS = ['acapulco', 'afghani', 'columbian', 'dosidos', 'gelato41', 'lemonskunk', 'nl', 'ogkush', 'rainbow', 'skunk1'];
const sign = { _by: 'noelops-import', _via: 'rank' };
const ts = (ms) => (typeof ms === 'number' && ms > 0 ? Timestamp.fromMillis(ms) : Timestamp.now());
const n = (v) => Math.max(0, Math.round(Number(v) || 0));
const placeId = (bucket) => (!bucket || bucket === '%stash' ? 'main' : String(bucket).startsWith('%') ? `noel_${bucket.slice(1)}` : `g${bucket}`);

// Members are matched by name (NoelOps had no sign-in, the HQ does).
const members = new Map();
(await db.collection('members').get()).forEach((d) => members.set(String(d.data().nameLower ?? d.data().name ?? '').toLowerCase(), d.id));
const noelCrew = new Map(Object.entries(data.crew ?? {}).map(([id, c]) => [id, c.name ?? 'Unknown']));
const memberFor = (name) => members.get(String(name ?? '').trim().toLowerCase().replace(/\s+/g, '_')) ?? members.get(String(name ?? '').trim().toLowerCase());

const writes = [];
const put = (path, doc, merge = false) => writes.push({ path, doc, merge });
const counts = {};
const count = (k) => (counts[k] = (counts[k] ?? 0) + 1);

// Places: stash houses and grows.
if (want('places')) {
  for (const [id, s] of Object.entries(data.stashes ?? {}))
    put(`locations/noel_${id}`, { kind: 'stash', name: s.name ?? 'Stash', note: s.note ?? '', excludeTotals: !!s.excludeTotals, crewId: null, order: 5, ...sign }, true), count('stashes');
  for (const [postal, g] of Object.entries(data.locations ?? {}))
    put(
      `locations/g${postal}`,
      {
        kind: 'grow', postal: String(postal), name: g.alias ?? `Postal ${postal}`, crewId: null, durationHours: n(g.durationHours) || 36, pots: n(g.pots),
        startTime: g.startTime ? ts(g.startTime) : null, strainPots: g.strainPots ?? {}, stashTo: 'main', storage: false, alertSent: !!g.harvestAlertSent, order: 10 + n(g.order), ...sign,
      },
      true,
    ),
      count('grows');
}

// Stock per place.
if (want('stock')) {
  const mainHas = (await db.doc('stock/main').get()).exists;
  if (mainHas && !only?.has('stock')) console.log('• Skipping stock: the Main Stash already has stock (pass --only=stock to overwrite).');
  else
    for (const [bucket, s] of Object.entries(data.stock ?? {})) {
      const doc = { ...sign };
      for (const st of STRAINS) if (s[st]) doc[st] = { bricks: n(s[st].bricks), trimmed: n(s[st].trimmed), untrimmed: n(s[st].untrimmed) };
      for (const k of ['coca', 'cokeSmall', 'cokeLarge', 'meth']) if (s[k] != null) doc[k] = n(s[k]);
      put(`stock/${placeId(bucket)}`, doc, true), count('stock');
    }
}

// Sales, linked to members by name where they've signed up.
if (want('sales')) {
  for (const [id, s] of Object.entries(data.sales ?? {})) {
    const who = s.who ?? noelCrew.get(s.sellerId) ?? 'Unknown';
    const product = s.strain ?? s.product;
    if (!product) continue;
    const place = placeId(s.bucket);
    put(`sales/noel_${id}`, {
      product, qty: n(s.bricks ?? s.qty) || 1, from: place, fromLabel: place === 'main' ? 'Main Stash' : place, sellerId: memberFor(who) ?? `noel:${s.sellerId ?? who}`, sellerName: who,
      cut: n(s.cut), price: s.price != null ? n(s.price) : null, narco: !!s.narco, note: String(s.note ?? '').slice(0, 60), byName: s.by ?? who, at: ts(s.ts), ...sign,
    }),
      count('sales');
  }
}

// Daily history (bricks pressed etc.).
if (want('history'))
  for (const [day, h] of Object.entries(data.history ?? {}))
    put(`history/${day}`, { bricksMade: n(h.bricksMade), cokeMade: n(h.cokeMade), methMade: n(h.methMade), ...sign }, true), count('history');

// Harvest yields per strain.
if (want('yields'))
  for (const [strain, list] of Object.entries(data.yields ?? {}))
    put(`yields/${strain}`, { samples: Object.values(list).map((y) => ({ buds: n(y.buds), pots: n(y.pots), at: n(y.ts) })).sort((a, b) => b.at - a.at).slice(0, 20), ...sign }), count('yields');

// The activity feed.
if (want('activity'))
  for (const [id, a] of Object.entries(data.activity ?? {}))
    put(`activity/noel_${id}`, { who: a.who ?? 'NoelOps', kind: a.kind ?? 'note', pre: a.pre ?? '', hi: a.hi ?? '', post: a.post ?? '', at: ts(a.ts), ...sign }), count('activity');

// Work counters (harvests, cooks…) for achievement trophies, for members who've signed up.
if (want('stats'))
  for (const [key, s] of Object.entries(data.stats ?? {})) {
    const id = decodeURIComponent(key).replace(/^id:/, '');
    const mid = memberFor(noelCrew.get(id));
    if (!mid) continue;
    put(`stats/${mid}`, { harvests: n(s.harvests), bud: n(s.bud), cooks: n(s.cooks), runs: n(s.runs), pressed: n(s.pressed) }, true), count('stats');
  }

console.log(`${dry ? 'Would write' : 'Writing'} ${writes.length} docs to ${live ? 'chosenops (LIVE)' : 'the emulator'}:`, counts);
const unlinked = [...new Set(Object.values(data.sales ?? {}).map((s) => s.who).filter((w) => w && !memberFor(w)))];
if (unlinked.length) console.log(`• Sellers not signed up yet (re-run --only=sales,stats once they are): ${unlinked.join(', ')}`);
if (!dry)
  for (let i = 0; i < writes.length; i += 400) {
    const b = db.batch();
    writes.slice(i, i + 400).forEach((w) => (w.merge ? b.set(db.doc(w.path), w.doc, { merge: true }) : b.set(db.doc(w.path), w.doc)));
    await b.commit();
  }
console.log(dry ? 'Dry run, nothing written.' : 'Done.');
