# Setup

Everything here runs on a laptop with Node 20+. No Docker, no cloud account and no funded wallet is required — the
default configuration boots an in-memory database seeded with fictional data and reports honestly when no blockchain
node is configured.

## Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | ≥ 20.11 | npm workspaces, native `fetch`, ES2022 target |
| npm | ≥ 10 | ships with Node 20 |
| PostgreSQL | 14+ | **only** if you set `DATABASE_DRIVER=postgres` |
| A local EVM node | any | **only** for on-chain anchoring (Hardhat node included) |

## Install

```bash
git clone <repo> && cd ERC721
cp .env.example .env
npm install
npm run build:shared        # apps import the shared package; build it once
```

`npm install` installs all four workspaces (`packages/shared`, `packages/contracts`, `apps/backend`,
`apps/frontend`) from the root lockfile.

## Run

```bash
# API on http://localhost:4000, web on http://localhost:5173
npm run dev
```

The Vite dev server proxies `/api` to `http://127.0.0.1:4000`, so browser code only ever uses relative URLs. That keeps
the same build working behind a preview host, a reverse proxy or a different origin.

Or run the two halves separately:

```bash
npm run dev:backend         # tsx watch src/index.ts
npm run dev:frontend        # vite --host 0.0.0.0 --port 5173
```

### Production-shaped local run

```bash
npm run build               # shared → backend (tsc) → frontend (vite build)
npm start -w @breastcare/backend
npx serve apps/frontend/dist -l 5173    # or any static server + /api reverse proxy
```

## Environment variables

All variables live in a single root `.env`, read by `apps/backend/src/config/env.ts` through a zod schema. The process
**exits with an actionable message** if a value fails validation, and **refuses to boot in production** with insecure
defaults (`JWT_SECRET`, `FIELD_ENCRYPTION_KEY`, `DEMO_AUTH_ENABLED=true`).

### Global

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` enables the insecure-default guard |
| `LOG_LEVEL` | `info` | `debug` · `info` · `warn` · `error` |

### API

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | |
| `HOST` | `0.0.0.0` | bind address |
| `CORS_ORIGIN` | `http://localhost:5173` | exact origin, not a wildcard |
| `JWT_SECRET` | dev placeholder | ≥ 16 chars; **must** be replaced |
| `JWT_EXPIRES_IN` | `8h` | |
| `DEMO_AUTH_ENABLED` | `true` | enables the seeded demo logins. **Set `false` in production** |
| `SEED_DEMO_DATA` | `true` | seeds the fictional dataset on an empty store |

### Database

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_DRIVER` | `memory` | `memory` (seeded, wiped on restart) or `postgres` |
| `DATABASE_URL` | `postgres://breastcare:breastcare@localhost:5432/breastcare` | |
| `PGSSLMODE` | `disable` | set `require` against managed Postgres |
| `FIELD_ENCRYPTION_KEY` | 64 zero hex chars | 32-byte hex key for AES-256-GCM field encryption |

### Blockchain

| Variable | Default | Notes |
| --- | --- | --- |
| `BLOCKCHAIN_RPC_URL` | `http://127.0.0.1:8545` | local Hardhat node |
| `BLOCKCHAIN_CHAIN_ID` | `31337` | |
| `BLOCKCHAIN_OPERATOR_KEY` | *(empty)* | private key of the account authorised on the contracts |
| `BLOCKCHAIN_SYSTEM_ADDRESS` | *(empty)* | the address that address resolves to |
| `PATIENT_REGISTRY_ADDRESS` | *(empty)* | written by `npm run deploy:local` |
| `CONSENT_MANAGER_ADDRESS` | *(empty)* | |
| `MEDICAL_RECORD_REGISTRY_ADDRESS` | *(empty)* | |
| `TREATMENT_REGISTRY_ADDRESS` | *(empty)* | |
| `AUDIT_LOG_ADDRESS` | *(empty)* | |

With no addresses configured the API still serves everything; every chain-dependent response reports
`configured: false, reachable: false` and explains what is missing rather than pretending.

### Frontend (`VITE_*` only — these are public)

| Variable | Default | Notes |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | relative by design |
| `VITE_BLOCKCHAIN_RPC_URL` | `http://127.0.0.1:8545` | read-only calls from the browser |
| `VITE_PATIENT_REGISTRY_ADDRESS` … `VITE_AUDIT_LOG_ADDRESS` | *(empty)* | same five contracts |
| `VITE_WALLET_CONNECT_PROJECT_ID` | *(empty)* | only needed for WalletConnect |

Never put a private key or a secret in a `VITE_*` variable — Vite inlines them into the bundle.

## Database

### In-memory (default)

`DATABASE_DRIVER=memory` builds the same `Store` interface over plain collections and seeds it with eight fictional
patients, three clinicians, an administrator, appointments, treatments, medications, nutrition plans, reports,
consents and blockchain records. It is wiped on every restart — which is exactly what you want for a demo, and exactly
why it is not the production driver.

### PostgreSQL

```bash
createdb breastcare
npm run db:init -w @breastcare/backend     # applies apps/backend/src/db/schema.sql
DATABASE_DRIVER=postgres npm run dev:backend
```

`apps/backend/src/db/schema.sql` creates every table — `users`, `patients`, `doctors`, `medical_records`,
`symptom_reports`, `risk_assessments`, `nutrition_plans`, `nutrition_logs`, `treatments`, `medications`,
`appointments`, `medical_reports`, `consents`, `notifications`, `audit_logs`, `blockchain_records` — with indexes, and
enables **row-level security** (`patient_isolation`) on the twelve patient-scoped tables so a leaked connection cannot
read across patients even if application-layer checks were bypassed.

Sensitive free-text fields are additionally encrypted at rest with AES-256-GCM using `FIELD_ENCRYPTION_KEY`
(`apps/backend/src/lib/crypto.ts`).

## Local blockchain

```bash
npm run chain              # Hardhat node, chainId 31337, http://127.0.0.1:8545
npm run deploy:local       # deploys AuditLog → PatientRegistry → ConsentManager
                           # → MedicalRecordRegistry → TreatmentRegistry, wires the operator,
                           # writes packages/contracts/deployments/localhost.{json,env}
```

Then start the API with the generated values:

```bash
set -a; . packages/contracts/deployments/localhost.env; set +a
export BLOCKCHAIN_OPERATOR_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # Hardhat account #0
npm run dev:backend
```

See [`CONTRACTS.md`](CONTRACTS.md) for the contract surfaces and what each one stores.

## Tests

```bash
npm run test              # shared 30 · backend 84 · contracts 55
npm run test:frontend     # frontend 18
npm run typecheck
```

The backend suite pins an unreachable RPC port and blank contract addresses in `apps/backend/vitest.config.ts`, so the
"honest offline reporting" cases cannot be flipped by a node that happens to be running locally.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Cannot find module '@breastcare/shared'` | run `npm run build:shared` |
| API returns `configured: false` for blockchain | no addresses in `.env`; run `npm run deploy:local` and source the generated file |
| `AlreadyRegistered(wallet)` when re-linking a wallet | the in-memory store was wiped but the chain state persisted; use another account or restart the node |
| Port 5173 taken | `vite` falls back to the next free port unless `strictPort` is set |
| Hardhat compile downloads a compiler | this repo compiles with the npm `solc` package (`packages/contracts/scripts/compile.ts`) so it works offline |
