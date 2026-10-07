# Production deployment

The stack is three deployables: a static frontend, a Node API, and a set of contracts on an EVM chain. The database is
a managed PostgreSQL instance. Nothing about the deployment is exotic.

## 1. Contracts

Deploy once, treat the addresses as configuration.

```bash
cd packages/contracts
# .env: SEPOLIA_RPC_URL=..., DEPLOYER_PRIVATE_KEY=...
npm run deploy:sepolia
```

The script prints and writes the five addresses. Copy them into both the backend and frontend environment.

Checklist before pointing production at a chain:

- Transfer ownership of all five contracts from the deployer EOA to a **multisig** (`Ownable2Step` — the new owner must
  accept).
- Call `setAuthorizedSystem(<backend operator address>, true)` on every contract, and revoke the deployer if it is not
  the operator.
- Verify the sources on the block explorer.
- Record the addresses, the chain id and the deploy transaction hashes somewhere durable. Contracts are immutable;
  there is no upgrade path.

## 2. Database

Use managed PostgreSQL (RDS, Cloud SQL, Neon, Supabase). Then:

```bash
DATABASE_URL=postgres://... npm run db:init -w @breastcare/backend
```

`apps/backend/src/db/schema.sql` creates the tables, indexes and the `patient_isolation` row-level-security policies.
Run migrations through your normal tooling after this point — `db:init` is for first boot.

Enable encryption in transit (`PGSSLMODE=require`) and at rest (the provider's disk encryption). Rotate
`FIELD_ENCRYPTION_KEY` on a schedule; the encrypted columns cannot be read without it, so keep an escrowed copy.

## 3. API

```bash
npm run build -w @breastcare/backend
NODE_ENV=production node apps/backend/dist/index.js
```

Required production configuration:

```bash
NODE_ENV=production
JWT_SECRET=<long random string, e.g. `openssl rand -hex 32`>
FIELD_ENCRYPTION_KEY=<64 hex chars>
DEMO_AUTH_ENABLED=false
SEED_DEMO_DATA=false
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://...
CORS_ORIGIN=https://app.example.com
BLOCKCHAIN_RPC_URL=https://<node>
BLOCKCHAIN_CHAIN_ID=11155111
BLOCKCHAIN_OPERATOR_KEY=<operator private key>
PATIENT_REGISTRY_ADDRESS=0x...
CONSENT_MANAGER_ADDRESS=0x...
MEDICAL_RECORD_REGISTRY_ADDRESS=0x...
TREATMENT_REGISTRY_ADDRESS=0x...
AUDIT_LOG_ADDRESS=0x...
```

The process **refuses to start** in production with the development `JWT_SECRET`, an all-zero `FIELD_ENCRYPTION_KEY`,
or `DEMO_AUTH_ENABLED=true`. That is deliberate — a demo login on a real deployment is the failure mode that cannot be
walked back.

Operational notes:

- The API is stateless; scale it horizontally behind a load balancer. Sessions are JWTs, not server-side state.
- Bind behind TLS. Terminate TLS at the load balancer or reverse proxy, not in Node.
- Structured JSON logs go to stdout. Ship them, and alert on `outcome: "denied"` audit entries spiking — that pattern
  is either a bug or an attack.
- Health endpoint: `GET /api/health`. Blockchain health: `GET /api/blockchain/health`.
- Chain unavailability is **not** an outage. The API keeps serving and reports `reachable: false`; only anchoring and
  on-chain verification degrade. Do not page on it as a P1.

### Container

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/contracts/package.json packages/contracts/
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
RUN npm ci
COPY . .
RUN npm run build:shared && npm run build:backend

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/backend ./apps/backend
EXPOSE 4000
CMD ["node", "apps/backend/dist/index.js"]
```

Run as a non-root user and give the container no write access outside `/tmp`.

## 4. Frontend

```bash
npm run build -w @breastcare/frontend      # emits apps/frontend/dist
```

Serve `dist/` from any static host (S3 + CloudFront, Netlify, Vercel, nginx). Two requirements:

1. **Proxy `/api` to the API origin.** Browser code only ever calls relative `/api/...` URLs, so there is no
   hard-coded host and no CORS surprise. With nginx:

   ```nginx
   location /api/ { proxy_pass http://api.internal:4000; }
   location /     { try_files $uri /index.html; }   # SPA fallback
   ```

   If you would rather call the API cross-origin, set `CORS_ORIGIN` on the API to the exact web origin — not `*`.

2. **Set the `VITE_*` variables at build time.** They are inlined into the bundle. Only public values belong there:
   contract addresses, a read-only RPC URL, and the relative API base. Never a key.

Cache `assets/*` immutably (they are content-hashed) and `index.html` with `no-cache`.

## 5. Release checklist

- [ ] `npm run typecheck` and all four test suites pass
- [ ] `DEMO_AUTH_ENABLED=false`, `SEED_DEMO_DATA=false`
- [ ] Fresh `JWT_SECRET` and `FIELD_ENCRYPTION_KEY`
- [ ] Contract addresses match the chain you intend to use
- [ ] Contract ownership is a multisig
- [ ] Backups enabled on the database, and a restore has actually been tested
- [ ] Alerting on 5xx, on denied-access spikes, and on chain `reachable: false` persisting
- [ ] The medical disclaimer and the demo banner behave correctly (the banner must be **absent** when
      `SEED_DEMO_DATA=false`)

## 6. Compliance note

This repository is a reference implementation. Before it carries real patient data it needs, at minimum: a completed
risk assessment for your jurisdiction (HIPAA, GDPR, or local equivalent), a signed BAA with every processor, an
access-log retention policy, a breach-notification runbook, and a clinical review of every piece of patient-facing
wording by a qualified professional. None of those are code changes, and none of them are optional.
