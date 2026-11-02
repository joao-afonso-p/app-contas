# Contas

Personal finance web app: monthly planning by buckets, real expenses, savings, investments and projections. It works offline, installs as a PWA and can sync across devices. The interface is in European Portuguese.

**App:** [asminhascontas.com](https://asminhascontas.com)

## Features

- **Planning**: income, expenses and savings buckets per month, with an allocation bar that must reach 100%.
- **Movements and Expenses**: inflows, outflows and transfers between buckets; statement import (PDF, Excel or text) with category suggestions and duplicate detection; linking expenses to savings movements.
- **Projections**: month-by-month editable grid, goals with a target and deadline, and planned movements that can be linked to real outflows.
- **Analytics, Investment and Overview**: planned vs. actual, investment vehicles with checkpoints and a simulator, total balance over time.
- **Guide and tours**: in-app guide (also as a PDF), interactive onboarding and progressive unlock of the advanced parts.
- **PWA**: desktop has the full app; mobile covers the essentials of day-to-day use.

## Stack

React 19, Vite, TypeScript, Tailwind CSS v4, Zustand, Recharts, `vite-plugin-pwa`, Vitest. Data lives in IndexedDB (`idb`) or Firestore (Firebase, with anonymous auth).

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests (Vitest)
npm run build      # typecheck + production build
```

With no configuration the app runs in local mode. To try sync, copy `.env.example` to `.env` and fill in the variables.

| Variable | Purpose |
| --- | --- |
| `VITE_FIREBASE_*` (6 variables) | Firebase project config. Without them, local mode only. |
| `VITE_PREMIUM_CODES` | Single-use codes to create synced spaces. Optional. |
| `VITE_GOATCOUNTER_CODE` | Anonymous usage stats. Only used in production builds. |
| `VITE_BASE` | Build base path (`/` in production). |

## Architecture

```
src/
  types.ts               data model
  lib/
    calc/                pure, tested logic: allocation, balances, projections,
                         categories, deduplication, movement/planned links
    ai/                  statement extraction (PDF/Excel) with the user's own key
    unlock.ts, coach.ts  progressive unlock and guided tours
    backup.ts            backup export and import
  data/
    adapter.ts           DataAdapter interface
    localAdapter.ts      IndexedDB (default, fully offline)
    firebaseAdapter.ts   real-time Firestore
  store/                 Zustand: state, actions and seeds
  screens/               one file per screen
  components/            base UI and shared components
  content/               guide and tours (data, with tests)
data/marta/              demo backup (9 months)
scripts/                 guide PDF and demo data generation
```

Principles:

- **Balances are always computed**, never typed in: `balance(month) = balance(month − 1) + planned allocation + month movements`. Projections reuse the same engine, separating confirmed reality from the projected future.
- **Logic lives in `lib/calc`**: pure functions with no data or UI access, covered by tests.
- **Data sits behind an adapter**: the rest of the app does not know whether it is in local or synced mode.
- **Additive changes**: new fields are optional, so existing data is never invalidated.

## Data and sync

- **Local mode**: IndexedDB on the device. Backup export and import (Settings → Data) as JSON.
- **Synced mode**: a Firestore space identified by a long random code. The rules (`firestore.rules`) require anonymous auth, and privacy relies on the code staying secret. Joining an empty space migrates the local data automatically.
- Local data and browser preferences are per origin, so changing domain requires exporting and importing a backup.

## Deploy

The [`deploy.yml`](.github/workflows/deploy.yml) workflow builds and publishes to GitHub Pages on every push to `main`, using repository secrets for the `VITE_*` variables. The custom domain is configured in Settings → Pages (`A` and `CNAME` DNS records), with `public/CNAME` in the repo, and the domain must be listed in Firebase Authentication's authorized domains.

## Guide and demo data

The guide content lives in `src/content/guide.ts`. To regenerate the PDF (`public/guia-contas.pdf`):

```bash
node scripts/dump-guide.cjs
python3 scripts/build-guide-pdf.py
```

`data/marta/` holds a realistic backup for showing the app without personal data (see the README in that folder).
