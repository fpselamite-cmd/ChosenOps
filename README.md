# ChosenOps — The Chosen Family Hub

A black-and-gold hub for **The Chosen**: member login (username + PIN), approval-gated signup, admin-editable ranks
and permissions, character profiles with portraits, a Chain-of-Command member wall, a treasury (Clean Money,
Dirty Money, Gang Rep) and a gang inventory.

Built with Vite + React + TypeScript + Tailwind, backed by Firebase (Auth + Firestore). Runs entirely on the free Spark plan — no card needed.

## Pages

| Page | What it does |
| --- | --- |
| **Sign in / Register** | Username + 4–8 digit PIN. The very first person to register founds the family (top rank). Everyone after waits for approval. |
| **Dashboard** | Family banner, announcement ("Word from the Top"), Clean / Dirty / Rep totals, leadership, recent money moves and stash activity. |
| **The Family** | Member wall grouped by rank, top of the chain first. Toggle **Portraits** / **List**. Search. |
| **Profile** | Character name, alias, status, specialty, phone, DOB, vehicle, Discord, backstory, portrait upload, and who reports to them. |
| **Treasury** | Running totals plus a ledger. Log money in/out or rep gained/lost. |
| **Inventory** | Add items (name, amount, unit cost, clean/dirty, category, location, notes). Optionally deduct the cost from the treasury. Quick +/- on quantities. |
| **Admin** | Approve pending members, set ranks / chain of command / suspensions, **reset PINs**, edit ranks and permissions, and set the family name, motto, logo and categories. |

Hover (or keyboard-focus) any member's name or portrait to see a quick-look card.

## Ranks & permissions

Ranks are fully editable in **Admin → Ranks & Permissions**. Defaults:

| Rank | Default permissions |
| --- | --- |
| Head of the Family | Everything (the top rank always has every permission) |
| Underboss | Everything |
| Consigliere | Approve & manage members, reset PINs, view/edit budget, edit inventory, announcements |
| Lieutenant | Approve members, view budget, edit inventory, announcements |
| Enforcer | View budget, edit inventory |
| Associate | View budget |
| Prospect | View only |

Officers can only act on members and ranks **below** their own rank. These rules are enforced on the server in
`firestore.rules`, not just hidden in the UI.

## Setting up Firebase (one time)

1. Go to <https://console.firebase.google.com>, click **Add project**, and name it (e.g. `the-chosen-hub`).
2. **Build → Authentication → Get started → Sign-in method** and enable **Email/Password**.
3. **Build → Firestore Database → Create database** (production mode, pick a region near you).
4. **Project settings → Your apps → Web (`</>`)**: register an app and copy the config values.
5. In this folder:
   ```bash
   npm install
   cp .env.example .env              # paste the config values into .env
   cp .firebaserc.example .firebaserc # put your project id in it
   npx firebase login
   npx firebase deploy --only firestore:rules   # upload the security rules
   ```
6. `npm run dev` and open the link. **Register first.** The first account becomes Head of the Family.

## Deploying

```bash
npm run deploy     # builds and deploys hosting + security rules
```

Your hub will be at `https://<project-id>.web.app`.

## Local development without a Firebase project

```bash
npm run emulators   # terminal 1: local Auth + Firestore (needs Java)
npm run dev:emu     # terminal 2: app pointed at the emulators
npm run test:rules  # security-rule tests
```

## Notes

- **Logo:** upload it in **Admin → Family Settings**. It shows on the sign-in page, sidebar and dashboard. Until then a placeholder crest is used.
- **Images** (portraits, logo) are resized in the browser and stored in Firestore, so no paid Storage bucket is needed.
- **Forgotten PIN:** an officer with the *Reset member PINs* permission opens **Admin → Members → Reset PIN** and
  creates a one-time code (valid 24 hours) for a member ranked below them. The member goes to the sign-in page →
  *"Forgot your PIN? … enter it here"*, enters the code and picks a new PIN. The old PIN stops working the moment the
  code is used. Ranks created before this feature existed need the permission ticked in **Ranks & Permissions**
  (the top rank always has it).
  - How it works without a server: each reset moves the member onto a fresh Firebase sign-in account that's linked back to
    their member file (`authLinks`). The security rules check the code (only its SHA-256 hash is stored) and retire the old
    account. You'll see extra entries like `name+1@members.chosen.hub` under Authentication. That's expected.
