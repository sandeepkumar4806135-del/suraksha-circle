# Firebase Deploy — Suraksha Circle

Short reference for shipping the production Firestore security rules + indexes.
All commands run from the repo root (`g:\suraksha-circle`).

## Prereqs

```bash
npm i -g firebase-tools
firebase login
# link the local checkout to your Firebase project (one time):
firebase use --add
# ...or target a project ad-hoc on every command:
# firebase deploy -P <your-project-id> --only firestore:rules,firestore:indexes
```

`firebase.json` already points at `firestore.rules` and `firestore.indexes.json`,
so no extra wiring is needed.

## Deploy rules + indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Deploy **rules only** (emergency rule fix, no index changes):

```bash
firebase deploy --only firestore:rules
```

Deploy **indexes only**:

```bash
firebase deploy --only firestore:indexes
```

## Verify

1. Firebase Console → **Firestore Database → Rules** — confirm the publish
   timestamp matches your deploy.
2. **Firestore Database → Indexes** — `sos_events` composite
   (`circleId` ASC, `status` ASC, `createdAt` DESC) shows **Enabled**.
3. In the app (signed in), trigger: check-in event, safe-zone add/delete,
   schedule add/mark-taken/delete, SOS raise → resolve. Watch for
   `PERMISSION_DENIED` in DevTools — none should appear.

## Local check (optional, before deploying)

```bash
# rules syntax dry-run via the emulator
firebase emulators:start --only firestore
```

## What is covered

| Collection | Queries used in code | Index needed? |
|---|---|---|
| `circles/{id}` (metadata doc) | direct doc read/write | none (key lookup) |
| `circles/{id}/events` | `orderBy(timestamp desc), limit(100)` | none — single-field sort inside one parent is automatic |
| `circles/{id}/safezones` | `orderBy(createdAt asc)` | none — automatic |
| `circles/{id}/schedules` | `orderBy(time asc)` | none — automatic |
| `sos_events` (top-level) | `where(circleId==) + where(status==) + orderBy(createdAt desc)` | **yes — composite in `firestore.indexes.json`** |

## Auth model (MVP)

- Every read/write requires `request.auth != null`.
- `events` are append-only (no update/delete).
- `schedules`: `kind`/`createdAt` immutable; `status` toggles `pending ↔ taken`
  with a paired `takenAt` (null ⇔ pending).
- `sos_events`: `circleId`/`createdAt` immutable (no cross-circle retarget);
  resolved alerts are never deleted (audit trail).
- Writes that fail offline fall back to localStorage in-app; a locally-created
  schedule/SOS resolves server-side only after its Firestore `addDoc` succeeds.
