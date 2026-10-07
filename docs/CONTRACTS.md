# Smart contracts

Five Solidity 0.8.24 contracts in `packages/contracts/contracts/`, built on OpenZeppelin v5 (`Ownable2Step`, `Pausable`,
`ReentrancyGuard`). They hold **identifiers, hashes, consent, permissions and audit timestamps** — never clinical
content.

## Deployment order and wiring

```
AuditLog ──▶ PatientRegistry ──▶ ConsentManager ──▶ MedicalRecordRegistry
                                   └───────────────▶ TreatmentRegistry
```

`AuditLog` is deployed first because the other four take its address in their constructors. After deployment the
deployer calls `setAuthorizedSystem(operator, true)` on every contract so the backend can act on a patient's behalf.

## What each contract does

### `AuditLog`

An append-only, `Pausable` event log. Nothing can be edited or deleted — there is no setter for an existing entry.

```solidity
struct AuditEntry { uint256 entryId; address actor; bytes32 patientId; bytes32 action; bytes32 dataHash; uint64 timestamp; }

function logAction(address actor, bytes32 patientId, bytes32 action, bytes32 dataHash) external onlySystem returns (uint256);
function entryCount() external view returns (uint256);
function getEntry(uint256 entryId) external view returns (AuditEntry memory);
function entriesForPatient(bytes32 patientId, uint256 offset, uint256 limit) external view returns (AuditEntry[] memory);
function recentEntries(uint256 limit) external view returns (AuditEntry[] memory);
```

Errors: `UnauthorizedWriter()`, `ZeroAction()`.

### `PatientRegistry`

Maps a **wallet** to a pseudonymous identity. The patient id is *derived*, not chosen:

```solidity
function derivePatientId(address wallet) public pure returns (bytes32);   // keccak256(abi.encodePacked("BREASTCARE_AI.PATIENT_V1", wallet))

function registerPatient(string pseudonym, bytes32 profileHash) external;                     // caller registers itself
function registerPatientFor(address wallet, string pseudonym, bytes32 profileHash) external onlySystem;
function getPatient(bytes32 patientId) external view returns (Patient memory);
function patientIdByWallet / getPatientByWallet / isPatientWallet / isActive ...
enum PatientStatus { Unregistered, Active, Paused, Closed }
```

Errors: `NotRegistered`, `AlreadyRegistered(address)`, `NotPatientWallet`, `UnauthorizedSystem`, `EmptyPseudonym`,
`InvalidWallet`, `SameWallet`, `UnknownPatientStatus`.

> **This derivation is the reason consent checks work.** `ConsentManager` keys consents by `patientIdByWallet`, so
> passing anything else — for example a hash of the off-chain pseudonymous id — silently reads as "not registered".
> Only the wallet-derived id is authoritative.

### `ConsentManager`

The access-control primitive. A grant is `(patientId, grantee) → Consent{scopeHash, grantedAt, expiresAt, revokedAt}`.

```solidity
function grantConsent(address grantee, bytes32 scopeHash, uint64 expiresAt) external;         // patient wallet
function grantConsentFor(address patient, address grantee, bytes32 scopeHash, uint64 expiresAt) external onlySystem;
function revokeConsent(address grantee) external;                                            // patient wallet
function emergencyRevoke(bytes32 patientId, address grantee) external onlySystem;
function hasActiveConsent(bytes32 patientId, address grantee) public view returns (bool);
function getConsent(bytes32 patientId, address grantee) external view returns (Consent memory);
function scopeHashFor(string scopeName, string description) external pure returns (bytes32);
```

Errors: `InvalidGrantee()`, `PatientNotRegistered(address)`, `NotPatientWallet()`, `UnauthorizedSystem()`,
`ConsentNotFound()`.

### `MedicalRecordRegistry`

Content-hash anchoring with versioning and verification.

```solidity
function registerRecord(bytes32 recordId, bytes32 patientId, bytes32 contentHash, bytes32 metadataHash) external returns (uint32 version);
function supersedeRecord(bytes32 recordId, bytes32 newContentHash, bytes32 newMetadataHash) external returns (uint32 version);
function verifyRecord(bytes32 recordId, bytes32 candidateHash) external view
    returns (bool exists, bool matches, uint32 version, bytes32 onChainHash, uint64 createdAt, uint64 updatedAt);
function verifyAndLog(bytes32 recordId, bytes32 candidateHash) external returns (bool matches);
```

Errors: `RecordNotFound`, `RecordAlreadyExists`, `UnauthorizedForPatient`, `PatientNotRegistered`,
`UnauthorizedSystem`, `EmptyContentHash`.

### `TreatmentRegistry`

Treatment plans with an enforced state machine. Authorisation is deliberately restricted: a plan can be authorised by
the proposing doctor, by a grantee holding **active consent**, or by an authorised system — **never by the patient
wallet**, so a patient cannot self-authorise a plan.

```solidity
enum TreatmentStatus { Proposed, Authorized, Active, OnHold, Completed, Cancelled }   // Completed/Cancelled are terminal

function registerTreatmentPlan(bytes32 planId, bytes32 patientId, address doctor, bytes32 planHash, bytes32 metadataHash) external;
function authorizeTreatmentPlan(bytes32 planId) external;
function updateTreatmentStatus(bytes32 planId, TreatmentStatus status, bytes32 noteHash) external;
function verifyPlan(bytes32 planId, bytes32 candidateHash) external view returns (bool exists, bool matches, uint32 version);
```

Errors: `PlanNotFound`, `PlanAlreadyExists`, `UnauthorizedForPatient`, `NotTreatingDoctor`, `NotPatientWallet`,
`UnauthorizedSystem`, `EmptyPlanHash`, `InvalidTransition(TreatmentStatus current, TreatmentStatus requested)`,
`AlreadyAuthorized`.

## Common surface

All five contracts: `Ownable2Step` (two-step ownership transfer), `Pausable` (`pause` / `unpause`, owner only), and a
system-role registry:

```solidity
function setAuthorizedSystem(address system, bool authorized) external onlyOwner;
```

`onlySystem` gates the backend's ability to act for a patient. Owner privileges are administrative only — the owner
cannot read, edit or delete a record, consent or audit entry.

## Compiling

```bash
cd packages/contracts
npm run compile
```

The repo compiles with the npm `solc` package via `scripts/compile.ts` rather than `hardhat compile`, so it works
without downloading a compiler binary. Output lands in `packages/contracts/artifacts/`, and the ABIs are copied to
`apps/backend/src/blockchain/abis.generated.ts` (a single `contractAbis` map) and `apps/frontend/src/lib/contracts/abis.ts`.

Compiler settings: `0.8.24`, optimizer 200 runs, `evmVersion: cancun` (OpenZeppelin v5 uses `mcopy`).

## Deploying

### Local

```bash
npm run chain              # Hardhat node on :8545, chainId 31337
npm run deploy:local       # writes packages/contracts/deployments/localhost.json and localhost.env
```

`scripts/deploy.ts` is **idempotent**: if a contract is already deployed at the recorded address it reuses it instead of
redeploying, which matters because the in-memory store is wiped on every API restart while chain state persists.

Then load the addresses into the API:

```bash
set -a; . packages/contracts/deployments/localhost.env; set +a
npm run dev:backend
```

### Testnet / mainnet

```bash
npm run deploy:sepolia
```

Requires `SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY` in `packages/contracts/.env`. Fund the deployer, then copy the
resulting addresses into the backend and frontend environment.

## Tests

```bash
npm run test -w @breastcare/contracts      # 55 tests, 6 suites
```

| Suite | Focus |
| --- | --- |
| `patientRegistry.test.ts` | registration, derivation, wallet transfer, status, duplicate registration |
| `consentManager.test.ts` | grant, renewal, expiry, revocation, emergency revocation, unauthorised callers |
| `medicalRecordRegistry.test.ts` | registration, supersession, verification, permission failures |
| `treatmentRegistry.test.ts` | state machine, invalid transitions, who may authorise |
| `auditLog.test.ts` | append-only behaviour, pagination, per-patient and per-actor filters |
| `integration.test.ts` | the full lifecycle across all five contracts |

Reverts are asserted by selector (`expectRevert`) rather than by message text, because a sibling custom error surfaces
as `unknown custom error` through the JSON-RPC provider.

## Reading structs from JavaScript

viem decodes Solidity structs as **named objects**, not positional arrays. Indexing `entry[0]` yields `undefined` and
surfaces later as a confusing `toLowerCase` TypeError. `apps/backend/src/blockchain/service.ts` therefore reads fields
through a shape-tolerant helper (`structField`) that accepts either representation.
