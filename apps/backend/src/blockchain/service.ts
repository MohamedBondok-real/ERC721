import type { Address, Hex } from "viem";
import { bytes32, keccak256, scopeHash as deriveScopeHash } from "../lib/crypto";
import { logger } from "../lib/logger";
import { serviceUnavailable } from "../lib/errors";
import { abiFor, chainStatus, configuredAddresses, getOperatorWallet, getPublicClient, operatorAddress } from "./client";

/* ------------------------------------------------------------------ */
/* Blockchain service                                                  */
/*                                                                     */
/* The only place that talks to the contracts. Every method returns a  */
/* result object describing what actually happened on-chain; when the  */
/* chain is unavailable the result says so explicitly and the caller   */
/* decides whether that is acceptable.                                 */
/*                                                                     */
/* PRIVACY INVARIANT: only hashes, pseudonymous ids and addresses are  */
/* ever passed to these methods. Callers must never pass names,        */
/* symptoms or clinical text — the types below make that hard to do.   */
/* ------------------------------------------------------------------ */

export interface AnchorRequest {
  patientId: string; // pseudonymous id or bytes32
  recordId: string; // bytes32
  recordType: string; // bytes32 (hash of a record-type label)
  contentHash: string; // bytes32
  locatorHash?: string; // bytes32
}

export interface AnchorResult {
  anchored: boolean;
  transactionHash: string | null;
  blockNumber: number | null;
  reason: string | null;
}

export interface VerificationResult {
  verified: boolean;
  exists: boolean;
  matches: boolean;
  onChainHash: string | null;
  version: number | null;
  transactionHash: string | null;
  reason: string | null;
}

const ZERO_BYTES32: Hex = `0x${"00".repeat(32)}`;

/**
 * viem decodes a Solidity struct as a *named object* when the ABI carries component names
 * (which solc output always does) and as a positional tuple otherwise. Read either shape so
 * a generated-ABI change can never silently produce `undefined` fields.
 */
type StructResult = Record<string, unknown> | readonly unknown[];

function structField<T>(value: StructResult, name: string, index: number): T {
  const source = value as Record<string, unknown> & readonly unknown[];
  const raw = Array.isArray(source) ? source[index] : source[name];
  return raw as T;
}

function toBytes32(value: string): Hex {
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return value as Hex;
  return bytes32(value) as Hex;
}

function requireChain(): { addresses: NonNullable<ReturnType<typeof configuredAddresses>>; wallet: NonNullable<ReturnType<typeof getOperatorWallet>> } {
  const addresses = configuredAddresses();
  const wallet = getOperatorWallet();
  if (!addresses || !wallet) {
    throw serviceUnavailable(
      "Blockchain integration is not configured. Deploy the contracts and set the *_ADDRESS and BLOCKCHAIN_OPERATOR_KEY environment variables.",
    );
  }
  return { addresses, wallet };
}

async function write(
  contractName: "PatientRegistry" | "ConsentManager" | "MedicalRecordRegistry" | "TreatmentRegistry" | "AuditLog",
  functionName: string,
  args: unknown[],
): Promise<{ transactionHash: Hex; blockNumber: number }> {
  const { addresses, wallet } = requireChain();
  const publicClient = getPublicClient();

  const hash = (await wallet.writeContract({
    address: addresses[contractName],
    abi: abiFor(contractName),
    functionName,
    args,
  } as never)) as Hex;
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
  return { transactionHash: hash, blockNumber: Number(receipt.blockNumber) };
}

async function read<T>(
  contractName: "PatientRegistry" | "ConsentManager" | "MedicalRecordRegistry" | "TreatmentRegistry" | "AuditLog",
  functionName: string,
  args: unknown[] = [],
): Promise<T> {
  const { addresses } = requireChain();
  const publicClient = getPublicClient();
  return publicClient.readContract({
    address: addresses[contractName],
    abi: abiFor(contractName) as never,
    functionName: functionName as never,
    args: args as never,
  }) as Promise<T>;
}

/* ------------------------------------------------------------------ */
/* Patients                                                            */
/* ------------------------------------------------------------------ */

/**
 * The on-chain patient identifier.
 *
 * `PatientRegistry` derives it from the linked wallet (`derivePatientId`) and `ConsentManager`
 * keys every consent by that same value, so the platform must never substitute its own hash of
 * the pseudonymous id when talking to those two contracts. Returns null when the patient has no
 * on-chain identity yet.
 */
export async function readPatientIdByWallet(walletAddress: string): Promise<string | null> {
  try {
    const id = await read<Hex>("PatientRegistry", "patientIdByWallet", [walletAddress as Address]);
    return id && id !== ZERO_BYTES32 ? id : null;
  } catch (error) {
    logger.debug("On-chain patient id lookup unavailable", { reason: error instanceof Error ? error.message.split("\n")[0] : String(error) });
    return null;
  }
}

/**
 * Register a pseudonymous patient identity on-chain.
 * `pseudonym` is a patient-chosen handle — it must never be a real name.
 */
export async function registerPatientOnChain(
  walletAddress: string,
  pseudonym: string,
  profileHash: string,
): Promise<AnchorResult & { onChainPatientId: string | null }> {
  try {
    const result = await write("PatientRegistry", "registerPatientFor", [walletAddress as Address, pseudonym, toBytes32(profileHash)]);
    return {
      anchored: true,
      transactionHash: result.transactionHash,
      blockNumber: result.blockNumber,
      reason: null,
      onChainPatientId: await readPatientIdByWallet(walletAddress),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    logger.warn("On-chain patient registration failed", { reason });
    return { anchored: false, transactionHash: null, blockNumber: null, reason, onChainPatientId: await readPatientIdByWallet(walletAddress) };
  }
}

export interface OnChainPatient {
  registered: boolean;
  patientId: string | null;
  wallet: string | null;
  pseudonym: string | null;
  profileHash: string | null;
  registeredAt: number | null;
  status: number | null;
}

export async function readPatientRegistration(
  patientId: string | null,
  walletAddress?: string | null,
): Promise<OnChainPatient> {
  // The registry is keyed by its own wallet-derived id. Without one, resolve it from the wallet.
  const identifier = patientId ?? (walletAddress ? await readPatientIdByWallet(walletAddress) : null);
  if (!identifier) {
    return { registered: false, patientId: null, wallet: null, pseudonym: null, profileHash: null, registeredAt: null, status: null };
  }
  try {
    const record = await read<StructResult>("PatientRegistry", "getPatient", [toBytes32(identifier)]);
    return {
      registered: true,
      patientId: identifier,
      wallet: structField<string>(record, "wallet", 1),
      pseudonym: structField<string>(record, "pseudonym", 2),
      profileHash: structField<string>(record, "profileHash", 3),
      registeredAt: Number(structField<bigint>(record, "registeredAt", 4)),
      status: Number(structField<bigint>(record, "status", 6)),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    logger.debug("On-chain patient lookup unavailable", { reason });
    return { registered: false, patientId: identifier, wallet: null, pseudonym: null, profileHash: null, registeredAt: null, status: null };
  }
}

/* ------------------------------------------------------------------ */
/* Consent                                                             */
/* ------------------------------------------------------------------ */

export function scopeHash(name: string, description: string): string {
  return deriveScopeHash(name, description);
}

export async function grantConsentOnChain(
  patientWallet: string,
  granteeWallet: string,
  scopeName: string,
  scopeDescription: string,
  expiresAtSeconds: number,
): Promise<AnchorResult> {
  try {
    const result = await write("ConsentManager", "grantConsentFor", [
      patientWallet as Address,
      granteeWallet as Address,
      scopeHash(scopeName, scopeDescription) as Hex,
      expiresAtSeconds,
    ]);
    return { anchored: true, transactionHash: result.transactionHash, blockNumber: result.blockNumber, reason: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    logger.warn("On-chain consent grant failed", { reason });
    return { anchored: false, transactionHash: null, blockNumber: null, reason };
  }
}

export async function revokeConsentOnChain(patientId: string, granteeWallet: string): Promise<AnchorResult> {
  try {
    const result = await write("ConsentManager", "emergencyRevoke", [toBytes32(patientId), granteeWallet as Address]);
    return { anchored: true, transactionHash: result.transactionHash, blockNumber: result.blockNumber, reason: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return { anchored: false, transactionHash: null, blockNumber: null, reason };
  }
}

/** Authoritative on-chain access check used to back up the off-chain consent table. */
export async function hasActiveConsentOnChain(patientId: string, granteeWallet: string): Promise<boolean | null> {
  try {
    return await read<boolean>("ConsentManager", "hasActiveConsent", [toBytes32(patientId), granteeWallet as Address]);
  } catch (error) {
    logger.debug("On-chain consent check unavailable", { reason: error instanceof Error ? error.message.split("\n")[0] : String(error) });
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Records                                                             */
/* ------------------------------------------------------------------ */

export async function anchorRecordHash(request: AnchorRequest): Promise<AnchorResult> {
  try {
    const result = await write("MedicalRecordRegistry", "registerRecord", [
      toBytes32(request.patientId),
      toBytes32(request.recordId),
      toBytes32(request.recordType),
      toBytes32(request.contentHash),
      request.locatorHash ? toBytes32(request.locatorHash) : ZERO_BYTES32,
    ]);
    return { anchored: true, transactionHash: result.transactionHash, blockNumber: result.blockNumber, reason: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    logger.warn("Record anchoring failed", { reason });
    return { anchored: false, transactionHash: null, blockNumber: null, reason };
  }
}

/**
 * Compare a locally recomputed hash with the anchored hash. Also writes a verification
 * entry to the on-chain audit trail so tampering attempts leave evidence.
 */
export async function verifyRecordOnChain(recordId: string, candidateHash: string): Promise<VerificationResult> {
  const normalisedRecordId = toBytes32(recordId);
  const normalisedCandidate = toBytes32(candidateHash);
  try {
    const view = await read<{ exists: boolean; matches: boolean; version: bigint; onChainHash: Hex }>(
      "MedicalRecordRegistry",
      "verifyRecord",
      [normalisedRecordId, normalisedCandidate],
    );

    let transactionHash: string | null = null;
    try {
      const logged = await write("MedicalRecordRegistry", "verifyAndLog", [normalisedRecordId, normalisedCandidate]);
      transactionHash = logged.transactionHash;
    } catch (error) {
      // A failed audit write must not mask the verification outcome.
      logger.warn("Verification audit write failed", { reason: error instanceof Error ? error.message.split("\n")[0] : String(error) });
    }

    return {
      verified: true,
      exists: view.exists,
      matches: view.matches,
      onChainHash: view.onChainHash,
      version: Number(view.version),
      transactionHash,
      reason: null,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return { verified: false, exists: false, matches: false, onChainHash: null, version: null, transactionHash: null, reason };
  }
}

/* ------------------------------------------------------------------ */
/* Treatments                                                          */
/* ------------------------------------------------------------------ */

export async function anchorTreatmentPlan(
  patientId: string,
  planId: string,
  modality: string,
  planHash: string,
  proposingDoctorWallet: string | null,
): Promise<AnchorResult> {
  try {
    const result = await write("TreatmentRegistry", "registerTreatmentPlan", [
      toBytes32(patientId),
      toBytes32(planId),
      toBytes32(modality),
      toBytes32(planHash),
      (proposingDoctorWallet ?? operatorAddress() ?? ZERO_ADDRESS) as Address,
    ]);
    return { anchored: true, transactionHash: result.transactionHash, blockNumber: result.blockNumber, reason: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    logger.warn("Treatment plan anchoring failed", { reason });
    return { anchored: false, transactionHash: null, blockNumber: null, reason };
  }
}

export async function updateTreatmentStatusOnChain(planId: string, status: number, noteHash: string): Promise<AnchorResult> {
  try {
    const result = await write("TreatmentRegistry", "updateTreatmentStatus", [toBytes32(planId), status, toBytes32(noteHash)]);
    return { anchored: true, transactionHash: result.transactionHash, blockNumber: result.blockNumber, reason: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return { anchored: false, transactionHash: null, blockNumber: null, reason };
  }
}

export async function readTreatmentPlan(planId: string): Promise<{ exists: boolean; status: number; planHash: string; version: number } | null> {
  try {
    const plan = await read<StructResult>("TreatmentRegistry", "getTreatmentPlan", [toBytes32(planId)]);
    return {
      exists: true,
      status: Number(structField<bigint>(plan, "status", 10)),
      planHash: structField<string>(plan, "planHash", 3),
      version: Number(structField<bigint>(plan, "version", 9)),
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */

export interface OnChainAuditEntry {
  entryId: number;
  actor: string;
  patientId: string;
  action: string;
  actionLabel: string | null;
  dataHash: string;
  source: string;
  timestamp: number;
}

const ACTION_LABELS: Record<string, string> = {
  PATIENT_REGISTERED: "Patient registered",
  CONSENT_GRANTED: "Consent granted",
  CONSENT_REVOKED: "Consent revoked",
  RECORD_REGISTERED: "Record hash anchored",
  RECORD_SUPERSEDED: "Record updated",
  RECORD_VERIFIED_OK: "Record verified — hash matched",
  RECORD_VERIFIED_MISMATCH: "Record verified — hash mismatch",
  TREATMENT_PROPOSED: "Treatment plan proposed",
  TREATMENT_AUTHORIZED: "Treatment authorized",
  TREATMENT_STATUS_UPDATED: "Treatment status updated",
  TREATMENT_AMENDED: "Treatment plan amended",
  TREATMENT_ACKNOWLEDGED: "Treatment acknowledged by patient",
};

export const ACTION_HASHES: Record<string, string> = Object.fromEntries(
  Object.keys(ACTION_LABELS).map((label) => [label, `0x${keccak256(label)}`]),
);

export function actionLabel(hash: string): string | null {
  const entry = Object.entries(ACTION_HASHES).find(([, value]) => value.toLowerCase() === hash.toLowerCase());
  return entry ? ACTION_LABELS[entry[0]] ?? null : null;
}

export async function readAuditTrail(patientId: string, limit = 50): Promise<OnChainAuditEntry[] | null> {
  try {
    const entries = await read<readonly StructResult[]>("AuditLog", "entriesForPatient", [toBytes32(patientId), 0n, BigInt(limit)]);

    return entries.map((entry) => {
      const action = structField<string>(entry, "action", 3);
      return {
        entryId: Number(structField<bigint>(entry, "entryId", 0)),
        actor: structField<string>(entry, "actor", 1),
        patientId: structField<string>(entry, "patientId", 2),
        action,
        actionLabel: actionLabel(action),
        dataHash: structField<string>(entry, "dataHash", 4),
        source: structField<string>(entry, "source", 5),
        timestamp: Number(structField<bigint>(entry, "timestamp", 6)),
      };
    });
  } catch (error) {
    logger.debug("On-chain audit read unavailable", { reason: error instanceof Error ? error.message.split("\n")[0] : String(error) });
    return null;
  }
}

export async function auditEntryCount(): Promise<number | null> {
  try {
    return Number(await read<bigint>("AuditLog", "entryCount"));
  } catch {
    return null;
  }
}

/** Convenience used by the /blockchain/status endpoint. */
export { chainStatus };

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
