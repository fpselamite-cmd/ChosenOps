// Prints NoelOps' data (and the leadership-only Discord webhook) as JSON, for the nightly encrypted backup.
//   node scripts/backup-noelops.mjs --live > backup.json   (needs GOOGLE_APPLICATION_CREDENTIALS)
// Restore: decrypt a backup (see hq/README.md) and run the Move NoelOps workflow with "force" on it.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const live = process.argv.includes('--live');
if (!live) process.env.FIREBASE_DATABASE_EMULATOR_HOST ??= '127.0.0.1:9000';
initializeApp(
  live
    ? { credential: applicationDefault(), projectId: 'chosenops', databaseURL: 'https://chosenops-default-rtdb.firebaseio.com' }
    : { projectId: 'demo-chosenops', databaseURL: 'http://127.0.0.1:9000?ns=demo-chosenops-default-rtdb' },
);
const db = getDatabase();
const [noelops, priv] = await Promise.all([db.ref('noelops').get(), db.ref('private').get()]);
const data = noelops.val();
if (!data || !data.stock) {
  console.error('NoelOps has no stock in the database: not saving a backup, so older ones stay untouched.');
  process.exit(1);
}
delete data.presence;
process.stdout.write(JSON.stringify({ noelops: data, private: priv.val() ?? {} }, null, 1));
process.exit(0);
