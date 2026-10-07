import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { verifyMessage } from "viem";
import type {
  AuditLogEntry,
  ConsentRecord,
  ConsentStatus,
  DoctorProfile,
  Notification,
  NotificationKind,
  PatientProfile,
  Role,
  UserAccount,
} from "@breastcare/shared";
import { getStore, type Store, type UserRecord } from "../db";
import { env } from "../config/env";
import { conflict, forbidden, notFound, unauthorized, ConsentRequiredError } from "../lib/errors";
import { logger } from "../lib/logger";
import { contentHash, newId, scopeHash } from "../lib/crypto";
import * as chain from "../blockchain/service";

/* ------------------------------------------------------------------ */
/* Audit logging                                                       */
/* ------------------------------------------------------------------ */

export interface AuditContext {
  actorId: string;
  actorRole: Role | "system";
  ipAddress?: string | null;
}

export async function audit(
  store: Store,
  context: AuditContext,
  action: string,
  target: { patientId?: string | null; resource: string; resourceId?: string | null; dataHash?: string | null },
  outcome: AuditLogEntry["outcome"] = "success",
): Promise<AuditLogEntry> {
  const entry: AuditLogEntry = {
    id: newId("AUD"),
    actorId: context.actorId,
    actorRole: context.actorRole,
    action,
    patientId: target.patientId ?? null,
    resource: target.resource,
    resourceId: target.resourceId ?? null,
    dataHash: target.dataHash ?? null,
    ipAddress: context.ipAddress ?? null,
    outcome,
    onChainEntryId: null,
    createdAt: new Date().toISOString(),
  };
  await store.auditLogs.insert(entry);
  return entry;
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export async function notify(
  store: Store,
  input: {
    userId: string;
    kind: NotificationKind;
    title: string;
    body: string;
    severity?: Notification["severity"];
    actionLabel?: string | null;
    actionHref?: string | null;
  },
): Promise<Notification> {
  return store.notifications.insert({
    id: newId("NTF"),
    userId: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    readAt: null,
    actionLabel: input.actionLabel ?? null,
    actionHref: input.actionHref ?? null,
    severity: input.severity ?? "info",
    createdAt: new Date().toISOString(),
  });
}

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  displayName: string;
  walletAddress: string | null;
  pseudonymousId: string | null;
}

export interface Session {
  token: string;
  expiresAt: string;
  user: SessionUser;
  patientId: string | null;
  doctorId: string | null;
}

function toSessionUser(user: UserRecord): SessionUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    walletAddress: user.walletAddress,
    pseudonymousId: user.pseudonymousId,
  };
}

export async function registerUser(
  store: Store,
  input: {
    email: string;
    password: string;
    displayName: string;
    role: Extract<Role, "patient" | "doctor">;
    birthYear?: number | null;
    walletAddress?: string | null;
    specialty?: string;
    licenseNumber?: string;
    institution?: string;
  },
): Promise<Session> {
  const email = input.email.trim().toLowerCase();
  const existing = await store.users.findFirst({ email });
  if (existing) throw conflict("An account with that email already exists");

  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(input.password, 10);
  const user: UserRecord = {
    id: newId("USR"),
    email,
    role: input.role,
    displayName: input.displayName.trim(),
    walletAddress: input.walletAddress ?? null,
    pseudonymousId: null,
    passwordHash,
    status: "active",
    lastLoginAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await store.users.insert(user);

  let patientId: string | null = null;
  let doctorId: string | null = null;

  if (input.role === "patient") {
    const birthYear = input.birthYear ?? new Date().getFullYear() - 45;
    const pseudonymousId = `PT-${contentHash(user.id).slice(0, 10).toUpperCase()}`;
    const profile: PatientProfile = {
      id: user.id,
      userId: user.id,
      pseudonymousId,
      displayName: user.displayName,
      birthYear,
      age: new Date().getFullYear() - birthYear,
      biologicalSex: "female",
      region: "Not provided",
      primaryDoctorId: null,
      walletAddress: user.walletAddress,
      onChainRegistered: false,
      onChainPatientId: null,
      bloodType: null,
      allergies: [],
      comorbidities: [],
      currentTreatmentPhase: "not-in-treatment",
      createdAt: now,
      updatedAt: now,
    };
    const created = await store.patients.insert(profile);
    patientId = created.id;
    await store.users.update(user.id, { pseudonymousId });
  } else {
    const doctor: DoctorProfile = {
      id: user.id,
      userId: user.id,
      displayName: user.displayName,
      specialty: input.specialty ?? "Breast surgery",
      licenseNumber: input.licenseNumber ?? "PENDING-VERIFICATION",
      institution: input.institution ?? "BreastCare AI Partner Clinic",
      email,
      walletAddress: user.walletAddress,
      acceptedPatients: 0,
      createdAt: now,
    };
    await store.doctors.insert(doctor);
    doctorId = doctor.id;
  }

  await audit(store, { actorId: user.id, actorRole: user.role }, "USER_REGISTERED", {
    patientId,
    resource: "user",
    resourceId: user.id,
  });

  return issueSession(user, patientId, doctorId);
}

export async function loginUser(store: Store, email: string, password: string): Promise<Session> {
  const user = await store.users.findFirst({ email: email.trim().toLowerCase() });
  if (!user) throw unauthorized("Email or password is incorrect");
  if (user.status === "suspended") throw forbidden("This account has been suspended");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await audit(store, { actorId: user.id, actorRole: user.role }, "LOGIN_FAILED", { resource: "user", resourceId: user.id }, "failure");
    throw unauthorized("Email or password is incorrect");
  }

  const patient = user.role === "patient" ? await store.patients.get(user.id) : undefined;
  const doctor = user.role === "doctor" ? await store.doctors.get(user.id) : undefined;
  await store.users.update(user.id, { lastLoginAt: new Date().toISOString() });
  await audit(store, { actorId: user.id, actorRole: user.role }, "LOGIN_SUCCEEDED", {
    patientId: patient?.id ?? null,
    resource: "user",
    resourceId: user.id,
  });

  return issueSession(user, patient?.id ?? null, doctor?.id ?? null);
}

/**
 * Wallet-signature authentication.
 *
 * The client signs a server-provided challenge with the connected wallet; the signature is
 * verified with viem (secp256k1 ECDSA, EIP-191 personal_sign) and matched to an account.
 */
export async function loginWithWallet(store: Store, input: { address: string; message: string; signature: string }): Promise<Session> {
  let valid = false;
  try {
    valid = await verifyMessage({ address: input.address as `0x${string}`, message: input.message, signature: input.signature as `0x${string}` });
  } catch (error) {
    logger.warn("Wallet signature verification failed", { reason: error instanceof Error ? error.message : String(error) });
  }
  if (!valid) {
    await audit(store, { actorId: input.address, actorRole: "system" }, "WALLET_LOGIN_FAILED", { resource: "user" }, "failure");
    throw unauthorized("Wallet signature could not be verified");
  }

  const user = await store.users.findFirst({ walletAddress: input.address.toLowerCase() });
  if (!user) throw unauthorized("No account is linked to this wallet. Create an account or link it in Settings.");

  const patient = user.role === "patient" ? await store.patients.get(user.id) : undefined;
  const doctor = user.role === "doctor" ? await store.doctors.get(user.id) : undefined;
  await audit(store, { actorId: user.id, actorRole: user.role }, "WALLET_LOGIN_SUCCEEDED", { resource: "user", resourceId: user.id });
  return issueSession(user, patient?.id ?? null, doctor?.id ?? null);
}

function issueSession(user: UserRecord, patientId: string | null, doctorId: string | null): Session {
  const expiresInSeconds = parseExpiry(env.JWT_EXPIRES_IN);
  const token = jwt.sign(
    { sub: user.id, role: user.role, patientId, doctorId },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );
  return {
    token,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    user: toSessionUser(user),
    patientId,
    doctorId,
  };
}

function parseExpiry(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) return 8 * 60 * 60;
  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86_400;
  return amount * multiplier;
}

export interface TokenPayload {
  sub: string;
  role: Role;
  patientId: string | null;
  doctorId: string | null;
}

export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    return {
      sub: decoded.sub,
      role: decoded.role,
      patientId: decoded.patientId ?? null,
      doctorId: decoded.doctorId ?? null,
    };
  } catch {
    throw unauthorized("Session expired or invalid. Please sign in again.");
  }
}

/* ------------------------------------------------------------------ */
/* Consent & access control                                            */
/* ------------------------------------------------------------------ */

/** Access decisions accept either a raw actor or an audit context. */
function normalizeActor(actor: AuditContext | { id: string; role: Role }): { id: string; role: Role } {
  if ("actorId" in actor) {
    return { id: actor.actorId, role: actor.actorRole === "system" ? "admin" : actor.actorRole };
  }
  return actor;
}

export function consentStatus(consent: ConsentRecord): ConsentStatus {
  if (consent.revokedAt) return "revoked";
  if (consent.expiresAt && new Date(consent.expiresAt).getTime() < Date.now()) return "expired";
  return consent.status;
}

export async function findActiveConsent(store: Store, patientId: string, granteeId: string): Promise<ConsentRecord | null> {
  const consents = await store.consents.list({ where: { patientId, granteeId } });
  const active = consents.find((consent) => consentStatus(consent) === "active");
  return active ?? null;
}

export interface AccessDecision {
  allowed: boolean;
  reason: string;
  /** True when the decision relied on the off-chain record because the chain was unreachable. */
  onChainUnavailable: boolean;
  /** True when the on-chain consent state and the off-chain record disagree. */
  mismatch: boolean;
  consent: ConsentRecord | null;
}

/**
 * Central access decision for any patient data.
 *
 * Least privilege:
 *   - a patient may access only their own record;
 *   - a clinician needs an active consent from that patient, cross-checked on-chain when
 *     the chain is reachable;
 *   - an admin has NO implicit access to clinical content. Admin access requires an
 *     explicit consent record scoped to `admin-review`, matching the privacy model in the
 *     platform documentation.
 */
export async function decideAccess(
  store: Store,
  actorInput: AuditContext | { id: string; role: Role },
  patientId: string,
): Promise<AccessDecision> {
  const actor = normalizeActor(actorInput);
  if (actor.role === "patient") {
    return actor.id === patientId
      ? { allowed: true, reason: "self", onChainUnavailable: false, mismatch: false, consent: null }
      : { allowed: false, reason: "patient-may-only-access-own-record", onChainUnavailable: false, mismatch: false, consent: null };
  }

  const consent = await findActiveConsent(store, patientId, actor.id);
  if (!consent) {
    return {
      allowed: false,
      reason: actor.role === "admin" ? "admin-has-no-implicit-access-to-clinical-records" : "no-active-consent",
      onChainUnavailable: false,
      mismatch: false,
      consent: null,
    };
  }

  // Cross-check with the chain when this specific consent was anchored there. `ConsentManager`
  // keys consents by the registry's wallet-derived patient id, so the check only makes sense
  // once the patient has an on-chain identity. Where either side is missing the chain is simply
  // not authoritative for this consent — that is reported, never guessed.
  const patient = await store.patients.get(patientId);
  const grantee = await store.users.get(consent.granteeId);
  const chainPatientId = patient?.onChainPatientId ?? null;
  let onChainUnavailable = true;
  let mismatch = false;

  if (consent.transactionHash && chainPatientId && grantee?.walletAddress) {
    const onChain = await chain.hasActiveConsentOnChain(chainPatientId, grantee.walletAddress);
    if (onChain === null) {
      onChainUnavailable = true;
    } else {
      onChainUnavailable = false;
      if (!onChain) {
        mismatch = true;
        logger.warn("On-chain consent disagrees with the off-chain record", { patientId, granteeId: actor.id });
      }
    }
  }

  const allowed = !mismatch;
  return {
    allowed,
    reason: allowed
      ? onChainUnavailable
        ? consent.transactionHash
          ? "consent-active-on-chain-unavailable"
          : "consent-active-not-anchored"
        : "consent-active"
      : "consent-revoked-on-chain",
    onChainUnavailable,
    mismatch,
    consent,
  };
}

/** Throws `ConsentRequiredError` when access is not allowed. */
export async function assertAccess(
  store: Store,
  actorInput: AuditContext | { id: string; role: Role },
  patientId: string,
): Promise<AccessDecision> {
  const actor = normalizeActor(actorInput);
  const decision = await decideAccess(store, actor, patientId);
  if (!decision.allowed) {
    await audit(store, { actorId: actor.id, actorRole: actor.role }, "ACCESS_DENIED", { patientId, resource: "patient" }, "denied");
    throw new ConsentRequiredError(patientId);
  }
  return decision;
}

export async function grantConsent(
  store: Store,
  input: {
    patientId: string;
    actorId: string;
    granteeId: string;
    scopeName: string;
    scopeDescription: string;
    expiresAt?: string | null;
    signature?: string | null;
  },
): Promise<{ consent: ConsentRecord; anchored: chain.AnchorResult }> {
  const patient = await store.patients.get(input.patientId);
  if (!patient) throw notFound("Patient not found");
  if (input.actorId !== input.patientId) throw forbidden("Only the patient can grant consent");

  const grantee = await store.users.get(input.granteeId);
  if (!grantee) throw notFound("Grantee not found");

  const existing = await findActiveConsent(store, input.patientId, input.granteeId);
  if (existing) throw conflict("An active consent already exists for this grantee");

  const derivedScopeHash = scopeHash(input.scopeName, input.scopeDescription);
  const consent: ConsentRecord = {
    id: newId("CNS"),
    patientId: input.patientId,
    granteeId: input.granteeId,
    granteeType: grantee.role === "admin" ? "institution" : "doctor",
    granteeName: grantee.displayName,
    scopeName: input.scopeName,
    scopeDescription: input.scopeDescription,
    scopeHash: derivedScopeHash,
    status: "active",
    grantedAt: new Date().toISOString(),
    expiresAt: input.expiresAt ?? null,
    revokedAt: null,
    signature: input.signature ?? null,
    transactionHash: null,
    createdAt: new Date().toISOString(),
  };

  const created = await store.consents.insert(consent);
  await notify(store, {
    userId: input.granteeId,
    kind: "consent-request",
    title: "You have been granted access to a patient record",
    body: `${patient.displayName} granted you access (${input.scopeName}).`,
    severity: "success",
    actionLabel: "Open patient",
    actionHref: `/doctor/patients/${input.patientId}`,
  });
  await audit(store, { actorId: input.actorId, actorRole: "patient" }, "CONSENT_GRANTED", {
    patientId: input.patientId,
    resource: "consent",
    resourceId: created.id,
    dataHash: derivedScopeHash,
  });

  const anchored =
    patient.walletAddress && grantee.walletAddress
      ? await chain.grantConsentOnChain(
          patient.walletAddress,
          grantee.walletAddress,
          input.scopeName,
          input.scopeDescription,
          input.expiresAt ? Math.floor(new Date(input.expiresAt).getTime() / 1000) : 0,
        )
      : { anchored: false, transactionHash: null, blockNumber: null, reason: "wallet-not-linked" };

  if (anchored.transactionHash) {
    await store.consents.update(created.id, { transactionHash: anchored.transactionHash });
  }

  return { consent: { ...created, transactionHash: anchored.transactionHash }, anchored };
}

export async function revokeConsent(
  store: Store,
  input: { patientId: string; actorId: string; consentId: string },
): Promise<{ consent: ConsentRecord; anchored: chain.AnchorResult }> {
  const consent = await store.consents.get(input.consentId);
  if (!consent) throw notFound("Consent not found");
  if (consent.patientId !== input.patientId) throw forbidden("Consent does not belong to this patient");
  if (input.actorId !== input.patientId) throw forbidden("Only the patient can revoke consent");

  const updated = await store.consents.update(input.consentId, { status: "revoked", revokedAt: new Date().toISOString() });

  await notify(store, {
    userId: consent.granteeId,
    kind: "consent-revoked",
    title: "Your access to a patient record has been revoked",
    body: `${consent.granteeName ? "The patient" : "The patient"} revoked the "${consent.scopeName}" consent. Access ends immediately.`,
    severity: "warning",
  });
  await audit(store, { actorId: input.actorId, actorRole: "patient" }, "CONSENT_REVOKED", {
    patientId: input.patientId,
    resource: "consent",
    resourceId: consent.id,
    dataHash: consent.scopeHash,
  });

  const patient = await store.patients.get(input.patientId);
  const grantee = await store.users.get(consent.granteeId);
  const anchored =
    patient?.onChainPatientId && grantee?.walletAddress
      ? await chain.revokeConsentOnChain(patient.onChainPatientId, grantee.walletAddress)
      : { anchored: false, transactionHash: null, blockNumber: null, reason: "patient-not-registered-on-chain" };

  return { consent: updated, anchored };
}

export { getStore };
