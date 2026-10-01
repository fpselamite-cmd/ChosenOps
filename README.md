# ChosenOps — The Chosen Family Archive

A black-and-gold, star-lit archive for **The Chosen**: the family's lore, history, characters and bloodlines in
one place. Members sign in with a username + PIN; leadership approves newcomers and runs ranks and permissions.

Built with Vite + React + TypeScript + Tailwind, backed by Firebase (Auth + Firestore). Runs entirely on the free Spark plan — no card needed.

## Pages

| Page | What it does |
| --- | --- |
| **Sign in / Register** | Username + 4–8 digit PIN. The very first person to register founds the family (top rank). Everyone after waits for approval. |
| **Home** | The family seal, "Word from the Top", canon lore, the latest Archive entries, journal excerpts, recent Chronicle events and leadership. |
| **The Archive** | The lore wiki: entries with cover images, categories (Family History, Legends, Places, Factions, Events, Artifacts, Customs — editable), search and a canon filter. Entries use simple formatting, `[[Other Entry]]` links and `@username` mentions with hover cards. |
| **The Chronicle** | A timeline of in-world events in order, each optionally linked to its Archive entry and the characters who were there. Supports "before the founding" (negative) years and custom date labels. |
| **Journals** | Every character's in-character diary, newest first. |
| **The Family** | Member wall grouped by rank, top of the chain first. Toggle **Portraits** / **List**. Search. |
| **Bloodlines** | Family trees drawn from "Parent of" and "Spouse of" ties, plus a list of sworn bonds, siblings, rivals and enemies. |
| **Profile** | Tabs for **Dossier** (portrait, quote, story, particulars), **Journal**, **Ties** and **Appears in** (lore and events featuring them). |
| **Admin** | Approve pending members, set ranks / chain of command / suspensions, **reset PINs**, edit ranks and permissions, and set the family name, motto, logo and Archive categories. |

Hover (or keyboard-focus) any member's name or portrait to see a quick-look card.

## Ranks & permissions

Ranks are fully editable in **Admin → Ranks & Permissions**. Defaults:

| Rank | Default permissions |
| --- | --- |
| Head of the Family | Everything (the top rank always has every permission) |
| Underboss | Everything |
| Consigliere | Approve & manage members, reset PINs, write & curate lore, announcements |
| Lieutenant | Approve members, write & curate lore, announcements |
| Enforcer, Associate, Prospect | Write lore |

- **Write lore** lets a member add Archive entries, Chronicle events and ties for their own character, and edit what they wrote. It's on for every rank unless switched off.
- **Curate lore** lets officers edit or remove anyone's entries and mark entries as **canon**.
- Anyone active can keep a journal.

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

7. Merge the hub's pull request into `main`. That starts the first deploy (watch it under GitHub → **Actions**).
   From then on every merge into `main` deploys automatically, and you can redeploy any time from
   **Actions → Deploy → Run workflow**. If the first run failed because a step above wasn't finished, just re-run it.
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

- **Logo:** the family seal ships with the app (`public/brand/`, cut out from `logo-source.png`). Uploading a different one in **Admin → Family Settings** overrides it.
- **Images** (portraits, Archive covers, logo) are resized in the browser and stored in Firestore, so no paid Storage bucket is needed. Archive covers keep a small card version on the entry and the full image in `loreCovers/`.
- **Forgotten PIN:** an officer with the *Reset member PINs* permission opens **Admin → Members → Reset PIN** and
  creates a one-time code (valid 24 hours) for a member ranked below them. The member goes to the sign-in page →
  *"Forgot your PIN? … enter it here"*, enters the code and picks a new PIN. The old PIN stops working the moment the
  code is used. Ranks created before this feature existed need the permission ticked in **Ranks & Permissions**
  (the top rank always has it).
  - How it works without a server: each reset moves the member onto a fresh Firebase sign-in account that's linked back to
    their member file (`authLinks`). The security rules check the code (only its SHA-256 hash is stored) and retire the old
    account. You'll see extra entries like `name+1@members.chosen.hub` under Authentication. That's expected.
