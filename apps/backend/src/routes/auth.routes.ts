import { Router } from "express";
import { loginSchema, registerSchema, walletSignatureSchema, patientProfileSchema, doctorProfileSchema, MEDICAL_DISCLAIMER, DEMO_DATA_BANNER } from "@breastcare/shared";
import { getStore } from "../db";
import { env } from "../config/env";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { asyncHandler, authenticate, auditContext, validateBody } from "../middleware/http";
import { audit, loginUser, loginWithWallet, registerUser } from "../services/core.service";
import { chainStatus } from "../blockchain/client";
import { registerPatientOnChain, readPatientRegistration } from "../blockchain/service";

export const authRouter = Router();

/** Platform metadata the UI needs before anyone signs in. */
authRouter.get(
  "/meta",
  asyncHandler(async (_req, res) => {
    const chain = await chainStatus();
    res.json({
      name: "BreastCare AI",
      disclaimer: MEDICAL_DISCLAIMER,
      demoMode: env.DATABASE_DRIVER === "memory",
      demoBanner: DEMO_DATA_BANNER,
      demoAuthEnabled: env.DEMO_AUTH_ENABLED,
      blockchain: {
        configured: chain.configured,
        reachable: chain.reachable,
        chainId: chain.chainId,
        blockNumber: chain.blockNumber,
        missing: chain.missing,
      },
    });
  }),
);

authRouter.post(
  "/register",
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      email: string;
      password: string;
      displayName: string;
      role: "patient" | "doctor";
      birthYear?: number | "";
      walletAddress?: string | "";
    };
    const session = await registerUser(getStore(), {
      email: body.email,
      password: body.password,
      displayName: body.displayName,
      role: body.role,
      birthYear: body.birthYear === "" ? null : body.birthYear,
      walletAddress: body.walletAddress === "" ? null : body.walletAddress,
    });
    res.status(201).json(session);
  }),
);

authRouter.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as { email: string; password: string };
    const session = await loginUser(getStore(), body.email, body.password);
    res.json(session);
  }),
);

authRouter.post(
  "/wallet/login",
  validateBody(walletSignatureSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as { address: string; message: string; signature: string };
    const session = await loginWithWallet(getStore(), body);
    res.json(session);
  }),
);

/** Challenge the client must sign for wallet authentication. */
authRouter.get(
  "/wallet/challenge",
  asyncHandler(async (req, res) => {
    const address = String(req.query.address ?? "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) throw badRequest("Provide a valid wallet address");
    const nonce = Math.random().toString(36).slice(2, 12);
    res.json({
      message: `Sign in to BreastCare AI\n\nWallet: ${address}\nNonce: ${nonce}\n\nThis signature proves you control the wallet. It does not authorise any transaction and no sensitive data is included.`,
      nonce,
    });
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const store = getStore();
    const actor = req.actor!;
    const patient = actor.patientId ? await store.patients.get(actor.patientId) : null;
    const doctor = actor.doctorId ? await store.doctors.get(actor.doctorId) : null;
    res.json({ user: actor, patient, doctor });
  }),
);

/** Complete or update the signed-in patient's profile. */
authRouter.put(
  "/me/patient-profile",
  authenticate,
  validateBody(patientProfileSchema),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const actor = req.actor!;
    if (actor.role !== "patient" || !actor.patientId) throw forbidden("Only patient accounts have a patient profile");

    const input = req.body as {
      displayName: string;
      birthYear: number;
      biologicalSex: "female" | "male" | "other" | "prefer-not-to-say";
      region: string;
      bloodType?: string | null;
      allergies: string[];
      comorbidities: string[];
      currentTreatmentPhase: string;
    };

    const updated = await store.patients.update(actor.patientId, {
      ...input,
      age: new Date().getFullYear() - input.birthYear,
      currentTreatmentPhase: input.currentTreatmentPhase as never,
      updatedAt: new Date().toISOString(),
    });
    await audit(store, auditContext(req), "PATIENT_PROFILE_UPDATED", {
      patientId: actor.patientId,
      resource: "patient",
      resourceId: actor.patientId,
    });
    res.json(updated);
  }),
);

authRouter.put(
  "/me/doctor-profile",
  authenticate,
  validateBody(doctorProfileSchema),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const actor = req.actor!;
    if (actor.role !== "doctor" || !actor.doctorId) throw forbidden("Only clinician accounts have a clinician profile");
    const updated = await store.doctors.update(actor.doctorId, req.body as never);
    res.json(updated);
  }),
);

/** Link a wallet to the signed-in account and register the pseudonymous on-chain identity. */
authRouter.post(
  "/me/wallet",
  authenticate,
  asyncHandler(async (req, res) => {
    const store = getStore();
    const actor = req.actor!;
    const { walletAddress, pseudonym } = req.body as { walletAddress?: string; pseudonym?: string };
    if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) throw badRequest("A valid wallet address is required");

    await store.users.update(actor.id, { walletAddress: walletAddress.toLowerCase() });

    let onChain = null;
    let patient = null;
    if (actor.role === "patient" && actor.patientId) {
      patient = await store.patients.update(actor.patientId, { walletAddress: walletAddress.toLowerCase() });
      const result = await registerPatientOnChain(walletAddress, pseudonym || patient.pseudonymousId, patient.pseudonymousId);

      // The registry derives the patient id from the wallet, so it is known even when this call
      // did not need to register (the wallet was registered in an earlier session). Persisting it
      // is what lets later consent checks and revocations be verified against the chain.
      if (result.onChainPatientId) {
        patient = await store.patients.update(actor.patientId, {
          onChainRegistered: true,
          onChainPatientId: result.onChainPatientId,
        });
      }

      if (result.anchored) {
        await store.blockchainRecords.insert({
          id: `BCH-${result.transactionHash}`,
          patientId: actor.patientId,
          kind: "patient-registration",
          label: "Pseudonymous patient registration",
          dataHash: patient.pseudonymousId,
          contract: "PatientRegistry",
          transactionHash: result.transactionHash,
          blockNumber: result.blockNumber,
          status: "confirmed",
          verification: "unverified",
          createdAt: new Date().toISOString(),
          confirmedAt: new Date().toISOString(),
        });
      }
      onChain = { ...result, registration: await readPatientRegistration(patient.onChainPatientId, patient.walletAddress) };
    }

    await audit(store, auditContext(req), "WALLET_LINKED", {
      patientId: actor.patientId,
      resource: "user",
      resourceId: actor.id,
    });
    res.json({ patient, onChain });
  }),
);

authRouter.get(
  "/me/blockchain",
  authenticate,
  asyncHandler(async (req, res) => {
    const store = getStore();
    const actor = req.actor!;
    const patient = actor.patientId ? await store.patients.get(actor.patientId) : null;
    if (!patient) throw notFound("No patient profile");
    res.json({
      status: await chainStatus(),
      registration: await readPatientRegistration(patient.onChainPatientId, patient.walletAddress),
    });
  }),
);
