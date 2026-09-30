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

## Going live (one-time setup)

The hub is already wired to the **chosenops** Firebase project and deploys itself from GitHub.
You only need to do these steps once, all in the browser:

**In the Firebase console** (<https://console.firebase.google.com/project/chosenops>):

1. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
   (Members never see email. The hub uses it behind the scenes for username + PIN.)
2. **Build → Firestore Database → Create database.** Choose **Start in production mode** and a location near your
   players (e.g. `nam5 (United States)`). The location can't be changed later.
3. **Build → Hosting → Get started.** Click *Next* through every step; you don't need to run the commands it shows.

**Create a deploy key** so GitHub can publish the site:

4. Open <https://console.cloud.google.com/iam-admin/serviceaccounts?project=chosenops> → **Create service account**.
   Name it `github-deploy` → *Create and continue* → add the roles **Firebase Admin** and **Service Usage Consumer**
   → *Done*.
5. Click the new account → **Keys → Add key → Create new key → JSON**. A file downloads.
6. In GitHub, open the repo → **Settings → Secrets and variables → Actions → New repository secret**.
   Name: `FIREBASE_SERVICE_ACCOUNT`. Value: open the downloaded file in Notepad, copy **everything**, and paste.
   Save, then **delete the downloaded file**. It's a password for your Firebase project.

**Deploy:**

7. GitHub → **Actions → Deploy → Run workflow**, pick the branch, and run it. After that, every merge into `main`
   deploys automatically.
8. Open **<https://chosenops.web.app>** and **register first**. The first account becomes Head of the Family.

Every deploy runs the security-rule tests first. If they fail, nothing is published.

## Local development

```bash
npm install
npm run dev        # runs the hub locally against the LIVE chosenops data
npm run deploy     # manual deploy (needs `npx firebase login` first)
```

### Offline sandbox (fake data, no Firebase account needed)

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
