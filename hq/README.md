# ChosenOps HQ

The Chosen's headquarters: crews, ops, money, blacksites and gear in one site that installs on phones.
Built fresh with Vite + React + TypeScript + Tailwind, on Firebase (Auth + Firestore, free Spark plan).

This folder is the new app. The old archive in the repo root keeps running until HQ goes live.

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
- **Crews**: leadership creates crews and picks leaders; crew leaders add and remove their own members,
  and set the crew's motto, color and emblem. People can be in several crews.
- **Family**: the chain of command, by rank or as an org chart (who answers to whom).

## Build progress

1. ✅ Foundation: sign-in, ranks, crews, Family, profiles, Admin
2. Stash, Timers, Meth, Coke
3. BlackMarket
4. Titles, MVPs, leaderboards, Map, Calendar
5. Blacksites
6. Gear & Loadouts
7. Discord, NoelOps import, go live
