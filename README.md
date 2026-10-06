# ChosenOps HQ

### ➜ [chosenops.web.app](https://chosenops.web.app)

The Chosen's headquarters: crews, narcotics, stash, money, blacksites, gear and loadouts in one site.
It works in any browser and installs on phones like an app (Share → Add to Home Screen).

Members sign in with their **name and a 4–8 digit PIN**. New people request to join and wait at the door until
leadership lets them in and gives them a rank.

---

## What's inside

| Page | What it's for |
| --- | --- |
| **Dashboard** | Word from the top, family stats, this month's leaderboards, your crews, who's online. |
| **My Locker** | Your own storages (On Me, Home, and any you name). Guns, attachments, ammo counters, drugs, gear. Sign gang property out of a stash, trade with other members, and name your own items. Only you can see it. |
| **Hall of Fame** | Monthly leaderboards for sales and bricks, every past month, all-time records. The top 3 each month get trophies. |
| **Narcotics** | NoelOps, rebuilt: grow timers, meth cooks, coke runs, stock per location, trimming and pressing, harvests and pot plans. Keeps its own green NoelOps look. |
| **Stash** | Every stash house and what's in it: drugs, guns, attachments, ammo and gear. The Main Stash is gang-wide. |
| **BlackMarket** | Sell from a stash or your locker, cuts and payouts, the 50% wash, price history, the wish list, budget and CSV export. Treasurer and leadership see everything; others see their own. |
| **Blacksites** | Log King of the Hill fights. Everyone who was there fills in kills, downs and supply runs and votes the MVP. Rep counts once a Lieutenant+ confirms it. Loot is claimed into lockers, and the rest goes to the stash. |
| **Gear & Loadouts** | A gunsmith with a dropdown for every attachment slot, shared builds with likes, and your character loadout (vest, primary, sidearm, melee, bag, utility) built from your locker. Public or private. |
| **Petty Crime** | Track your petty rep and crimes, and send rep to the family. Lieutenant+ confirms it. |
| **Crews** | Crews work as roles: being in a crew can unlock pages. Crew leaders run their own roster. |
| **Family** | The chain of command, by rank or as an org chart. |
| **Map** | The postal map. Drop pins that are just yours or for the family; leadership can limit pins to ranks or crews. |
| **Calendar** | Events with RSVP and repeats, ops timers, character birthdays and anniversaries. |
| **Profiles** | Dossier, keepsake cabinet with trophies, family card, blacksite record, loadout, and your own **Appearance** settings (accent color, sky, motion, text size). |
| **Admin** | Approve members, ranks and permissions, item catalog, Discord, gang settings. |

**Ranks:** Boss, Consigliere, Underboss, Treasurer, Caporegime, Lieutenant, Enforcer, Soldier, Associate. Each rank's
permissions and pages can be changed in Admin. Everyone below Lieutenant starts with Dashboard, Blacksites, Gear, Petty
Crime, Crews and Family. Crews can open more.

---

## Getting started

1. **Register first** on the site. The first person to register becomes the Boss.
2. **Make yourself owner:** GitHub → **Actions** → **Set owner** → Run workflow → your member name.
   Owners get **Admin → Admin access**: set the admin password and give or take away admin access.
3. **Admin password:** whoever has it opens the small gold lock (bottom of the Dashboard, or under the sign-in
   form) to unlock full admin. Admins can do everything except act on the top rank.
4. **Bring in NoelOps data:** Actions → **Import NoelOps** → Run workflow. Leave *Dry run* ticked to preview, then run
   it again unticked. Once members have signed up, run it once more with `sales,stats` to link sales to them.
5. **Load the item catalog:** Admin → Item catalog → **Load**: 599 guns, attachments, ammo, melee, armor and gear.
6. **Discord (optional):** Admin → Discord. Paste a webhook for Blacksites and/or Rep donations and tick the events.

---

## For developers

The app lives in [`hq/`](hq/): Vite + React + TypeScript + Tailwind on Firebase (Auth + Firestore, free plan).
All access is enforced by `hq/firestore.rules`, with tests in `hq/tests/`.

```bash
cd hq
npm install
npm run emulators    # terminal 1 (needs Java)
npm run seed:demo    # terminal 2: a sample family to try things with
npm run dev:emu      # http://localhost:5173, sign in as "Don Vito" / 1234
npm run test:rules   # security rule tests
```

**Deploying:** every push to `main` runs `.github/workflows/deploy.yml`: type check, rule tests, build, then deploy
(hosting, Firestore rules and indexes) to the `chosenops` Firebase project. It can also be run by hand from Actions.
More detail in [`hq/README.md`](hq/README.md).
