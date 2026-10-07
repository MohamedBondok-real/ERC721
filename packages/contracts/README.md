# BreastCare AI — Smart Contracts

On-chain layer for the BreastCare AI platform. The blockchain is used for **consent,
integrity, auditability and access control** — never for storing clinical data.

## What lives on-chain vs off-chain

| On-chain (public, permanent)                          | Off-chain (encrypted, access-controlled)      |
| ----------------------------------------------------- | --------------------------------------------- |
| Pseudonymous patient id (`bytes32` derived from wallet)| Patient name, date of birth, contact details  |
| Consent grants / revocations + scope hash              | Symptoms, medical & family history            |
| Medical record content hashes                          | Lab results, imaging, radiology notes         |
| Treatment plan document hashes + status transitions    | Treatment plans, dosages, clinical notes      |
| Audit trail of actions                                 | Nutrition data, medications, appointments     |
| Wallet addresses / timestamps                          | Anything a clinician wrote about the patient  |

**Nothing that identifies a patient or describes their health is ever written to a
transaction.** Only 32-byte keccak256 hashes and pseudonymous identifiers cross the wire.

## Contracts

| Contract                     | Responsibility                                                             |
| ---------------------------- | -------------------------------------------------------------------------- |
| `AuditLog.sol`               | Append-only immutable audit trail. No update/delete functions exist.        |
| `PatientRegistry.sol`        | Pseudonymous patient registration, wallet binding, lifecycle status.        |
| `ConsentManager.sol`         | Patient consent grant/renew/revoke, expiry, access-control root.            |
| `MedicalRecordRegistry.sol`  | Record hash anchoring, supersession, integrity verification.                |
| `TreatmentRegistry.sol`      | Treatment plan hashes, clinician authorization, status lifecycle.           |

### Access-control model

`MedicalRecordRegistry` and `TreatmentRegistry` delegate every authorization decision to
`ConsentManager.hasActiveConsent`. A caller may act on a patient's data only if it is:

1. the patient's own bound wallet, **or**
2. an authorized platform system (the backend relayer, set by the owner), **or**
3. a healthcare professional holding active, non-expired, non-revoked consent.

`AuditLog.logAction` is restricted to authorized systems, while `logSelfAction` lets any
account attribute an action to itself — the trail is attributable either way.

## Development

```bash
# from the repository root
npm install

# compile
npm run compile -w @breastcare/contracts

# unit tests (Hardhat in-process EVM)
npm test -w @breastcare/contracts

# gas report
REPORT_GAS=true npm test -w @breastcare/contracts

# coverage
npm run test:coverage -w @breastcare/contracts
```

## Local blockchain

```bash
# terminal 1 — run a node bound to 0.0.0.0 so the frontend preview can reach it
npm run chain          # hardhat node --hostname 0.0.0.0

# terminal 2 — deploy + write addresses to deployments/localhost.json
npm run deploy:local

# export ABIs + addresses for the frontend
npm run export:abi -w @breastcare/contracts
```

## Deployment to a live network

```bash
export SEPOLIA_RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"
export BLOCKCHAIN_OPERATOR_KEY="0x..."   # funded deployer key — never commit this
npm run deploy:sepolia
```

The deploy script is idempotent: `deployments/<network>.json` records every address, and
re-running will report the existing deployment rather than deploying duplicates.

## Security notes

- `Ownable2Step` prevents a mistyped owner transfer from bricking the system.
- `Pausable` lets the owner freeze writes during an incident; views keep working.
- No contract stores plaintext; a hash collision would require breaking keccak256.
- Consent revocation is immediate: sibling registries re-check on every call.
- `AuditLog` is append-only by construction — there is no code path that removes an entry.
- The contracts have not been audited. Do not deploy to mainnet without a professional
  audit and a bug-bounty programme.
