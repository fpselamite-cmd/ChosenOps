// Makes a member an owner of the HQ (or removes them). Owners alone hand out admin access.
// Runs with the deploy service account, so only someone who can run this repo's Actions can do it.
//
//   node scripts/set-owner.mjs --name "Your Name" [--remove] [--live]
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const val = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const name = val('name');
const remove = args.includes('--remove');
const live = args.includes('--live');
if (!name) {
  console.error('Usage: node scripts/set-owner.mjs --name "Member Name" [--remove] [--live]');
  process.exit(1);
}

if (!live) process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
initializeApp(live ? { credential: applicationDefault(), projectId: 'chosenops' } : { projectId: 'demo-chosenops' });
const db = getFirestore();

const key = name.trim().toLowerCase().replace(/\s+/g, '_');
const uid = (await db.doc(`names/${key}`).get()).data()?.uid;
if (!uid) {
  console.error(`No member called "${name}". They need to register in the app first.`);
  process.exit(1);
}
const b = db.batch();
b.set(db.doc('meta/owners'), { ids: remove ? FieldValue.arrayRemove(uid) : FieldValue.arrayUnion(uid) }, { merge: true });
b.update(db.doc(`members/${uid}`), { admin: !remove });
await b.commit();
console.log(remove ? `${name} is no longer an owner (and no longer admin).` : `${name} is now an owner, with admin access.`);
