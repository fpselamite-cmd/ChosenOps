# ChosenOps HQ

The Chosen's headquarters: crews, ops, money, blacksites and gear in one site that installs on phones.
Built fresh with Vite + React + TypeScript + Tailwind, on Firebase (Auth + Firestore, free Spark plan).

Live at **https://chosenops.web.app**. Pushing to `main` deploys it (see Going live).

## Try it locally (fake data, nothing touches the live site)

```bash
cd hq
npm install
npm run emulators    # terminal 1 (needs Java)
npm run seed:demo    # terminal 2: a sample family with 4 crews
npm run dev:emu      # then open http://localhost:5173 and sign in as "Don Vito" / 1234
npm run test:rules   # security rule tests
```

## How it's organised

- **Ranks** (Boss → Consigliere → Underboss → Treasurer → Caporegime → Lieutenant → Enforcer → Soldier → Associate)
  grant gang-wide permissions, editable in **Admin → Ranks & permissions**. The top rank always has everything.
  Officers only act on people and ranks below them. All of it is enforced in `firestore.rules`.
- **Page access**: each rank has a list of pages it can open. By default everyone below Lieutenant sees only
  Dashboard, Blacksites, Gear & Loadouts, Petty Crime, Crews and Family.
- **Crews are roles**: leadership creates crews, picks leaders and ticks which extra pages each crew unlocks
  (e.g. a Soldier in the grow crew gets Stash and Timers). Crew leaders add and remove their own members and set
  the crew's motto, color and emblem. People can be in several crews.
- **Petty Crime**: everyone tracks their own petty rep (quick +/− and a crime log) and can send rep to the family.
  A Lieutenant or above confirms it before it counts toward the family's gang rep; turned-down rep goes back.
- **Narcotics** opens NoelOps (`/noelops/`, the page in `public/noelops/`) in a new tab. NoelOps runs the grows, cooks
  and coke runs and owns the drug stock. Its data lives in this project's Realtime Database behind
  `database.rules.json`, and it uses HQ sign-in: the **Narco** role edits, leadership manages (Admin, settings, places),
  other blooded members only see stash houses and stats, associates nothing. Leadership's HQ pages keep the access list
  in step with ranks and roles (`src/components/NoelAccessSync.tsx`). The HQ reads and writes it live (`src/lib/noelops.ts`).
- **Stash** (gold) lists every place and everything in it. Drug counts come live from NoelOps; guns, attachments, ammo
  and gear are kept in Firestore. Stash houses are shared with NoelOps (the HQ adds its own crew and postal); grows are
  managed in NoelOps. The **Main Stash** is gang-wide. Adding and editing places needs **Manage ops**.
- **BlackMarket** (gold) is where narcotics are sold. A sale takes the product out of NoelOps' stock and is written to
  NoelOps' sales log as well as the HQ's.
- Every ops write is signed with who did it and what opened the page (rank or crew role); the rules check both.
- **Map** and **Calendar** are buttons in the header.
- The NoelOps pages keep their original colors: green grow-light (Stash, Timers), cyan (Meth), ice blue (Coke),
  red on black (BlackMarket).
- **Family**: the chain of command, by rank or as an org chart (who answers to whom).

## Going live and deploying

- **Deploys**: every push to `main` runs `.github/workflows/deploy.yml`: type check, security-rule tests, build, then
  `firebase deploy` (hosting, Firestore rules and indexes) to the `chosenops` project. It uses the
  `FIREBASE_SERVICE_ACCOUNT` repo secret (a service-account JSON key). It can also be run by hand from the Actions tab.
- **First sign-up**: the first person to register on the live site founds the family and becomes Boss; everyone
  after that waits for approval. Data from the old archive app doesn't interfere (separate collections and sign-in).
- **NoelOps import**: Actions tab → **Import NoelOps** → Run workflow. Leave *Dry run* ticked to see what it would
  write, then run it again unticked. It copies grows, stash houses, stock, sales, history, yields, the activity feed and
  work counters. Run it again with `sales,stats` once members have signed up, to link sales to them by name.
  Locally: `node scripts/import-noelops.mjs --from <file or url> [--live] [--only=…] [--dry-run]`.
- **Owner and admin access**: register in the app, then Actions tab → **Set owner** → your member name. Owners get
  Admin → **Admin access**, where they set the admin password and give or take away admin. Anyone given the password
  opens the small gold lock (bottom of the Dashboard, or under the sign-in form) and enters it. Admins can do
  everything except act on the top rank. The Boss can't hand out admin; only owners can.
- **Discord**: Admin → Discord. Paste a webhook for Blacksites and/or Rep donations, tick the events, Send a test.
  Everything is off until then. Webhook URLs live in the database, never in the repo.
- **NoelOps database**: the `chosenops` project's Realtime Database (create it once: Firebase console → Build →
  Realtime Database → Create, US, locked mode). Its rules (`database.rules.json`) deploy with every push. NoelOps'
  Discord webhook is kept where only leadership can read it; NoelOps queues its messages and any open leadership page
  (HQ or NoelOps) sends them.
- **Moving NoelOps** (once): 1) in the **old** NoelOps Firebase project (console → Realtime Database → Rules), paste
  `{ "rules": { "noelops": { ".read": true, ".write": false } } }` and Publish, so nothing changes during the move;
  2) Actions → **Move NoelOps**, dry run first (it lists NoelOps crew who aren't linked yet: link them in Admin →
  NoelOps → **NoelOps names**, by the name they use in NoelOps, and give them the Narco role), then for real;
  3) after two weeks, lock the old database completely: `{ "rules": { ".read": false, ".write": false } }`.
- **NoelOps backups**: Actions → **NoelOps backup** runs nightly and saves an encrypted copy to the `noelops-backups`
  branch. It needs a `NOELOPS_BACKUP_KEY` repo secret (a long random password; keep a copy somewhere safe, without it
  the backups can't be opened). To restore: download a `.json.enc` file and run
  `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:'<key>' -in <file>.json.enc -out backup.json`, then
  `node scripts/move-noelops.mjs --live --force --from=backup.json` (with `GOOGLE_APPLICATION_CREDENTIALS` set).
- **Map**: `public/map/city.jpg` (the postal map from NoelOps). Replace the file to change it.
- **Item catalog**: `src/data/catalog.json`; Admin → Item catalog → Load/Refresh pushes it to the database.

## Build progress

1. ✅ Foundation: sign-in, ranks, page access, crews as roles, Family, Petty Crime, profiles, Admin
2. ✅ Narcotics (Overview · Weed · Meth · Coke) and Stash
3. ✅ BlackMarket, My Locker, keepsake cabinet and trophies, item catalog
4. ✅ Leaderboards and Hall of Fame, Map, Calendar
5. ✅ Blacksites
6. ✅ Gear & Loadouts
7. ✅ Discord editors, NoelOps import, go live

## NoelOps change notes

Newest first. Every NoelOps change adds an entry here, written so it can be pasted straight into Discord (no tables,
no links, under 2,000 characters). Older notes are in the old NoelOps repo.

### 🔒 Oct 8, 2026: NoelOps moves into ChosenOps HQ and gets locked down
- NoelOps now lives at **chosenops.web.app/noelops** and the old link sends you there
- Sign in with your **ChosenOps HQ** name and PIN. If you're signed in to HQ, you're already in. No more NoelOps PINs
- NoelOps is for the **Narco** crew and leadership. Leadership gets **Admin** automatically from their HQ rank, no password
- Adding, editing and removing grow locations is leadership's now
- Your name, picture and rank come from your **HQ profile**
- The data is locked: only people with access can see or change anything, and nightly backups are encrypted
- Discord messages still go out; leadership keeps the webhook private
