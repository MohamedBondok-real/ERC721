# BreastCare AI

**Clinical decision-support and patient-management platform for breast cancer care** — awareness, educational risk
assessment, nutrition support, treatment and medication tracking, clinician collaboration, and blockchain-based
consent, integrity and auditability.

> ## ⚕️ Medical disclaimer
>
> **BreastCare AI is an educational and clinical decision-support platform. It does not provide a medical diagnosis or
> replace a qualified healthcare professional. Risk assessments and nutrition information are informational only. Always
> consult an appropriately qualified healthcare professional for diagnosis and treatment decisions.**

> ## 🧪 Demo data
>
> **FICTIONAL DEMO DATA — NOT REAL PATIENT INFORMATION**
>
> The default configuration boots with a seeded, entirely fictional dataset so the platform can be reviewed without
> inventing an account. Never enter real patient information into a demo deployment.

---

## What this is — and what it deliberately is not

| It does | It does not |
| --- | --- |
| Produce a **Low / Moderate / High risk *indicator*** from an educational questionnaire | Diagnose cancer. The words "you have breast cancer" appear nowhere in the product |
| Store clinical data in a relational database, hashed for integrity | Put medical content on a blockchain |
| Anchor **identifiers, hashes, consent, permissions and audit timestamps** on-chain | Anchor names, symptoms, notes, assessments or images |
| Let a clinician read a record **only while an explicit consent grant is active** | Give administrators implicit access to clinical records |
| Track medications and doses the patient records | Change a dosage, prescribe, or recommend stopping a treatment |
| Answer educational questions from a fixed knowledge base | Advise on an individual case |

Every clinical decision stays with a qualified professional. The platform's job is to make the information around that
decision organised, attributable and verifiable.

---

## Architecture

```
ERC721/
├── apps/
│   ├── backend/            Express + TypeScript API (controllers → services → store → chain)
│   │   ├── src/routes/     auth · patient · care · consent · platform(+admin)
│   │   ├── src/services/   core (access control) · clinical · care · platform
│   │   ├── src/db/         Store abstraction: in-memory + PostgreSQL drivers, schema.sql (RLS)
│   │   ├── src/blockchain/ viem client, generated ABIs, contract service
│   │   └── test/           84 API/service tests
│   └── frontend/           React 18 + Vite + Tailwind + Radix + TanStack Query + Recharts + wagmi
│       └── src/pages/      landing · auth · patient · doctor · admin
├── packages/
│   ├── shared/             domain types, zod schemas, risk engine, nutrition & knowledge bases, hashing
│   └── contracts/          5 Solidity contracts, Hardhat, 55 contract tests
├── docs/
│   ├── SETUP.md            local setup, environment variables, database
│   ├── CONTRACTS.md        contract surfaces, deployment, local chain
│   ├── DEPLOYMENT.md       production deployment
│   ├── SECURITY.md         security & privacy considerations
│   └── legacy-erc721/      the original repository contents, preserved
└── .env.example
```

### The split that matters

```
 ┌─────────────────────────── off-chain ───────────────────────────┐   ┌────── on-chain ──────┐
 │  names · symptoms · notes · assessments · nutrition · reports   │   │ pseudonymous IDs     │
 │  PostgreSQL / in-memory store, AES-256-GCM field encryption     │──▶│ SHA-256 content hash │
 │                                                                 │   │ consent + scope hash │
 │  everything a clinician actually reads                          │   │ audit entries        │
 └─────────────────────────────────────────────────────────────────┘   │ permissions          │
                                                                       └──────────────────────┘
```

Nothing sensitive is ever written to a transaction. What is written is enough to *prove* the off-chain record has not
changed, and to *prove* who was allowed to read it and when.

---

## Quick start

```bash
git clone <this repo> && cd ERC721
cp .env.example .env          # every value has a working local default
npm install
npm run build:shared

# 1. local chain + contracts (optional — the API reports "offline" honestly without it)
npm run chain                 # terminal A: Hardhat node on :8545
npm run deploy:local          # terminal B: deploys 5 contracts, writes deployments/localhost.env

# 2. API + web
npm run dev                   # API on :4000, web on :5173
```

Open **http://localhost:5173**.

### Demo accounts

Password for every account: `BreastCare#Demo2026`

| Role | Email | Notes |
| --- | --- | --- |
| Patient | `amina@demo.breastcare.ai` | in active treatment |
| Patient | `grace@demo.breastcare.ai` | survivor on endocrine therapy |
| Patient | `sofia@demo.breastcare.ai` | awaiting diagnostic work-up |
| Patient | `clara@demo.breastcare.ai` | high-risk indicator + red-flag symptoms |
| Doctor | `doctor@demo.breastcare.ai` | breast surgeon |
| Doctor | `oncologist@demo.breastcare.ai` | medical oncologist |
| Admin | `admin@demo.breastcare.ai` | platform admin — **no implicit record access** |

Demo logins are gated by `DEMO_AUTH_ENABLED`. Set it to `false` for anything real.

---

## Testing

```bash
npm run test              # shared (30) + backend (84) + contracts (55)
npm run test:frontend     # frontend (18)
npm run typecheck         # shared + backend + frontend
npm run build             # shared → backend → frontend production build
```

| Suite | Tests | Covers |
| --- | --- | --- |
| `packages/contracts` | 55 | happy paths, reverts, unauthorised callers, edge cases, cross-contract integration |
| `apps/backend` | 84 | auth, access control, consent, records, risk, nutrition, care, platform, honest-offline behaviour |
| `packages/shared` | 30 | risk engine, hashing, nutrition plan builder, safety copy |
| `apps/frontend` | 18 | landing page contract, safety wording, label maps, disclaimer text |

The safety-copy tests are worth reading: they assert that no affirmative sentence anywhere in the risk or nutrition
wording can be read as a diagnosis.

---

## Feature map

**Patient** — dashboard · risk assessment (7-step questionnaire, pluggable model) · symptom tracking with red-flag
detection · nutrition (4 phases, 7 side-effect tracks, personalised plan builder, meal log, adherence charts) ·
treatment plans · medication & dose tracking · appointments · medical records with hash verification · clinician
reports with "Verify Record Integrity" · consent management · blockchain explorer · AI assistant · knowledge centre ·
notifications · settings with wallet linking.

**Clinician** — consent-derived patient list (there is no "all patients" query) · alerts for red flags and non-low risk
indicators · patient detail with assessment history · clinical notes · report authoring.

**Administrator** — aggregate analytics only · account management · audit log including denials · blockchain records ·
risk-model registry.

---

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/SETUP.md`](docs/SETUP.md) | prerequisites, install, every environment variable, database setup and schema |
| [`docs/CONTRACTS.md`](docs/CONTRACTS.md) | contract responsibilities, function surfaces, deployment, running a local chain |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | production deployment for API, web, database and contracts |
| [`docs/SECURITY.md`](docs/SECURITY.md) | threat model, access control, encryption, blockchain privacy boundaries |

---

## License

MIT. The clinical wording, disclaimers and safety constraints are part of the product and should not be removed.
