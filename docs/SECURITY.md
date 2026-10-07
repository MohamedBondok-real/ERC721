# Security & privacy

This platform handles health information, so the security model is written down rather than implied. The short
version: **the blockchain is a proof layer, not a storage layer, and access control is enforced on every request.**

## Threat model

| Threat | Mitigation |
| --- | --- |
| A clinician reads a patient who never consented | `decideAccess` runs before any read, on every request, and denials are audited |
| An administrator reads clinical records | Admins have **no implicit access**; the reason string is `admin-has-no-implicit-access-to-clinical-records` |
| A patient reads another patient's record | `patientScope` compares the token's patient id to the requested one and returns 403, not 400 |
| A record is quietly altered after the fact | SHA-256 content hash stored at write time, anchored on-chain, re-verified on demand |
| Sensitive data leaks via the blockchain | Only identifiers, hashes, consent state, permissions and audit timestamps are ever submitted |
| Sensitive data leaks via URLs | Patient ids appear in query strings for cross-patient access checks; **no medical content** is ever in a URL |
| A demo login reaches production | `NODE_ENV=production` refuses to boot while `DEMO_AUTH_ENABLED=true` |
| A leaked DB connection reads across patients | PostgreSQL row-level security (`patient_isolation`) on the twelve patient-scoped tables |
| A stolen database dump | AES-256-GCM encryption at rest for sensitive free-text fields |
| A chain outage takes the product down | Chain unavailability degrades anchoring only; reads, writes and access control keep working |

## Authentication & sessions

- Passwords are hashed with **bcrypt** and never returned by any endpoint — the session payload omits the hash field.
- Login failures return an identical message for "unknown user" and "wrong password"; there is no user enumeration.
- Sessions are JWTs (`JWT_EXPIRES_IN`, default 8h) signed with `JWT_SECRET`. Suspended accounts are rejected at
  authentication with 403, not at authorisation.
- Wallet login uses a signed challenge (`GET /api/auth/wallet/challenge`, then `POST /api/auth/wallet/login`).
- The frontend stores the token in `localStorage` and clears it plus the whole query cache the moment a 401 arrives.

## Authorisation

One function decides everything: `decideAccess(store, actor, patientId)` in `apps/backend/src/services/core.service.ts`.
It returns one of these reasons, and the UI shows them verbatim:

| Reason | Meaning |
| --- | --- |
| `self` | the patient's own record |
| `patient-may-only-access-own-record` | a patient tried to open someone else's |
| `admin-has-no-implicit-access-to-clinical-records` | admins need an explicit `admin-review` consent |
| `no-active-consent` | no grant exists |
| `consent-active` | grant exists **and** the chain confirms it |
| `consent-active-not-anchored` | grant exists; it was never written on-chain |
| `consent-active-on-chain-unavailable` | grant exists; no node to check against |
| `consent-revoked-on-chain` | the contract says revoked — access denied |

Three properties matter and are covered by tests:

1. **Authorisation runs before any read, and independently of chain availability.** An offline node must never widen
   who may see a record. An earlier version of this code only enforced authorisation when the chain was reachable,
   which leaked data across patients; that is exactly what the test suite now pins down.
2. **Denials are audited.** A denied read produces an `ACCESS_DENIED` audit row just like a successful one.
3. **A mismatch between chain and database is surfaced, never silently resolved.** If the contract says revoked and
   the database says active, access is denied and the disagreement is logged.

## Consent

- Only a patient account can grant or revoke consent (`POST /api/consent`, `POST /api/consent/:id/revoke`).
- Grants are scoped: a `scopeName` plus description, hashed with `ConsentManager.scopeHashFor` and stored on-chain.
- Expiry is enforced at read time (`consentStatus`), not just stored.
- Revocation is immediate: the next request fails, and the revocation transaction is verifiable afterwards.
- Duplicate grants for the same `(patientId, granteeId)` return **409**, so a scope change means an explicit revoke
  followed by a new grant — there is no silent widening.

## Blockchain privacy boundary

**On-chain:** pseudonymous patient id (derived from a wallet), SHA-256 content hashes, consent grants with scope
hashes and timestamps, revocations, audit entries (actor, action, patient id, data hash, timestamp), treatment plan
ids and status transitions.

**Off-chain, always:** names, dates of birth, contact details, symptom descriptions, clinical notes, risk assessment
answers, nutrition logs, report content, recommendations, images.

Two consequences worth stating plainly:

- A `bytes32` patient id derived from a wallet is **pseudonymous, not anonymous**. If the wallet is ever linked to an
  identity, the on-chain history is linkable too. Patients should use a dedicated wallet.
- Hashes of low-entropy data can be brute-forced. The hashed payloads include the pseudonymous id and multiple
  clinical fields, which makes pre-image attacks impractical, but never hash a small enumerable value alone.

## Data protection

- Sensitive free-text columns are encrypted with **AES-256-GCM** using `FIELD_ENCRYPTION_KEY` (32 bytes, hex). The key
  is validated at boot and the process refuses to start in production with the all-zero development key.
- The API sets restrictive CORS (`CORS_ORIGIN` is an exact origin, never `*`), and `helmet` provides the standard
  header set.
- Structured logs never include request bodies, passwords, tokens or clinical text. Assistant questions are
  explicitly **not** written to the audit trail.
- Rate limiting belongs in front of the API (load balancer or API gateway); the reference deployment does not
  implement it in-process.

## Contract hardening

- `Ownable2Step` on all five contracts, so ownership cannot be sent to a wrong address by typo.
- `Pausable` on all five, owner-only.
- A separate `onlySystem` role for the backend operator; owner privileges are administrative only and cannot read or
  edit a record.
- `AuditLog` is append-only — there is no function that modifies or deletes an entry.
- `TreatmentRegistry` enforces its state machine in-contract (`InvalidTransition`), and a **patient cannot
  self-authorise** a treatment plan. Authorisation requires the proposing doctor, active consent, or an authorised
  system.
- Custom errors with parameters rather than string reverts, which keeps deployment cheap and failures precise.

## Known limitations

Stated so nobody is surprised later:

- **The risk engine is educational.** It is a rule-based model with hand-set weights, labelled
  `AI-assisted / educational risk assessment`. It is not calibrated to any population and must not be used for
  clinical triage. The `RiskAssessmentModel` interface exists precisely so a validated model can replace it.
- **The AI assistant answers only from the platform's own knowledge base.** It refuses diagnosis and
  medication-change requests and escalates urgent language to the emergency statement. It is not an LLM and does not
  reason about an individual case.
- **The in-memory driver wipes on restart** while chain state persists, so re-linking the same wallet reverts with
  `AlreadyRegistered(wallet)`. That is a demo artefact, not a production path.
- **Consent is modelled per grantee, not per record.** A grant covers a scope, not a document list.
- **No key rotation, no HSM, no KMS integration.** `FIELD_ENCRYPTION_KEY` and `BLOCKCHAIN_OPERATOR_KEY` come from the
  environment. Wire them to a secrets manager before production.

## Reporting a vulnerability

Please do not open a public issue. Contact the maintainers privately with a reproduction, and allow time for a fix
before disclosure.
