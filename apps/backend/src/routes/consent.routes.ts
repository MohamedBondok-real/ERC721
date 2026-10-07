import { Router } from "express";
import { consentGrantSchema } from "@breastcare/shared";
import { getStore } from "../db";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { asyncHandler, auditContext, authenticate, requireRole, validateBody } from "../middleware/http";
import { audit, consentStatus, grantConsent, revokeConsent, findActiveConsent } from "../services/core.service";
import { doctorDashboardStats } from "../services/platform.service";
import * as chain from "../blockchain/service";

export const consentRouter = Router();
consentRouter.use(authenticate);

/** Consents the patient has granted. */
consentRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const actor = req.actor!;
    const patientId = actor.role === "patient" ? actor.patientId! : (req.query.patientId as string);
    if (!patientId) throw badRequest("patientId is required");
    if (actor.role !== "patient" && actor.id !== patientId) {
      await import("../services/core.service").then(({ assertAccess }) => assertAccess(store, actor, patientId));
    }

    const consents = await store.consents.list({ where: { patientId }, orderBy: "grantedAt", order: "desc" });
    const patient = await store.patients.get(patientId);

    // Cross-check each consent against the chain where both wallets are known.
    const withChain = await Promise.all(
      consents.map(async (consent) => {
        const grantee = await store.users.get(consent.granteeId);
        const onChain =
          patient?.walletAddress && grantee?.walletAddress
            ? await chain.hasActiveConsentOnChain(patient.pseudonymousId, grantee.walletAddress)
            : null;
        return { ...consent, effectiveStatus: consentStatus(consent), onChainActive: onChain };
      }),
    );

    res.json({ consents: withChain });
  }),
);

consentRouter.post(
  "/",
  validateBody(consentGrantSchema),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const actor = req.actor!;
    if (actor.role !== "patient" || !actor.patientId) throw forbidden("Only patient accounts can grant consent");
    const body = req.body as { granteeId: string; scopeName: string; scopeDescription: string; expiresAt?: string | null };
    const result = await grantConsent(store, {
      patientId: actor.patientId,
      actorId: actor.id,
      granteeId: body.granteeId,
      scopeName: body.scopeName,
      scopeDescription: body.scopeDescription,
      expiresAt: body.expiresAt ?? null,
    });
    res.status(201).json(result);
  }),
);

consentRouter.post(
  "/:id/revoke",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const actor = req.actor!;
    if (actor.role !== "patient" || !actor.patientId) throw forbidden("Only patient accounts can revoke consent");
    const result = await revokeConsent(store, { patientId: actor.patientId, actorId: actor.id, consentId: req.params.id! });
    res.json(result);
  }),
);

/** Doctors and institutions the patient can choose from when granting access. */
consentRouter.get(
  "/grantees",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const doctors = await store.doctors.list();
    res.json({
      grantees: doctors.map((doctor) => ({
        id: doctor.id,
        name: doctor.displayName,
        role: "doctor" as const,
        specialty: doctor.specialty,
        institution: doctor.institution,
        walletLinked: Boolean(doctor.walletAddress),
      })),
    });
  }),
);

/** The consent state a clinician currently has for one patient (used by the UI banner). */
consentRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = req.query.patientId as string;
    if (!patientId) throw badRequest("patientId is required");
    const consent = await findActiveConsent(store, patientId, req.actor!.id);
    res.json({ consent, status: consent ? consentStatus(consent) : "none" });
  }),
);

/* ------------------------------------------------------------------ */
/* Doctor workspace                                                    */
/* ------------------------------------------------------------------ */

export const doctorRouter = Router();
doctorRouter.use(authenticate, requireRole("doctor", "admin"));

doctorRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const doctorId = req.actor!.doctorId ?? req.actor!.id;
    res.json(await doctorDashboardStats(store, doctorId));
  }),
);

/**
 * Patients who have granted this clinician access.
 *
 * The list is derived from active consents — there is no "all patients" query available to
 * a clinician. Admins see the same consent-derived list; administrative access to clinical
 * content additionally requires an explicit `admin-review` consent.
 */
doctorRouter.get(
  "/patients",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const actor = req.actor!;
    const consents = await store.consents.list({ where: { granteeId: actor.doctorId ?? actor.id } });
    const active = consents.filter((consent) => consentStatus(consent) === "active");
    const patientIds = [...new Set(active.map((consent) => consent.patientId))];

    const search = String(req.query.search ?? "").toLowerCase().trim();
    const rows = [];

    for (const patientId of patientIds) {
      const patient = await store.patients.get(patientId);
      if (!patient) continue;
      if (search && !patient.displayName.toLowerCase().includes(search) && !patient.pseudonymousId.toLowerCase().includes(search)) {
        continue;
      }

      const [assessments, treatments, appointments] = await Promise.all([
        store.riskAssessments.list({ where: { patientId }, orderBy: "completedAt", order: "desc" }),
        store.treatments.list({ where: { patientId } }),
        store.appointments.list({ where: { patientId }, orderBy: "startsAt", order: "desc" }),
      ]);

      const now = Date.now();
      rows.push({
        patientId,
        pseudonymousId: patient.pseudonymousId,
        displayName: patient.displayName,
        age: patient.age,
        riskLevel: assessments[0]?.level ?? null,
        riskAssessedAt: assessments[0]?.completedAt ?? null,
        treatmentStatus: treatments.find((treatment) => treatment.status === "active")?.status ?? treatments[0]?.status ?? "none",
        lastAppointment: appointments.find((appointment) => new Date(appointment.startsAt).getTime() < now)?.startsAt ?? null,
        nextAppointment: appointments.find((appointment) => new Date(appointment.startsAt).getTime() >= now && appointment.status !== "cancelled")?.startsAt ?? null,
        accessStatus: "granted",
        scopeName: active.find((consent) => consent.patientId === patientId)?.scopeName ?? null,
      });
    }

    await audit(store, auditContext(req), "PATIENT_LIST_READ", { resource: "patient" });
    res.json({ patients: rows, total: rows.length });
  }),
);

/** Risk-assessment alerts across the clinician's consenting patients. */
doctorRouter.get(
  "/alerts",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const actor = req.actor!;
    const consents = await store.consents.list({ where: { granteeId: actor.doctorId ?? actor.id } });
    const patientIds = [...new Set(consents.filter((consent) => consentStatus(consent) === "active").map((consent) => consent.patientId))];

    const alerts = [];
    for (const patientId of patientIds) {
      const [assessment] = await store.riskAssessments.list({ where: { patientId }, orderBy: "completedAt", order: "desc" });
      const symptoms = await store.symptoms.list({ where: { patientId }, orderBy: "reportedAt", order: "desc" });
      const redFlags = symptoms.filter((symptom) => symptom.redFlag);
      const patient = await store.patients.get(patientId);

      if ((assessment && assessment.level !== "low") || redFlags.length > 0) {
        alerts.push({
          patientId,
          displayName: patient?.displayName ?? patientId,
          riskLevel: assessment?.level ?? null,
          urgency: assessment?.urgency ?? null,
          redFlagSymptoms: redFlags.map((symptom) => symptom.label),
          assessedAt: assessment?.completedAt ?? null,
        });
      }
    }

    res.json({ alerts: alerts.sort((a, b) => (a.riskLevel === "high" ? -1 : 1)) });
  }),
);

doctorRouter.get(
  "/reports",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const reports = await store.reports.list({ where: { doctorId: req.actor!.doctorId ?? req.actor!.id }, orderBy: "date", order: "desc" });
    res.json({ reports: reports.slice(0, 50) });
  }),
);

doctorRouter.post(
  "/patients/:patientId/notes",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const { title, note } = req.body as { title?: string; note?: string };
    if (!note) throw badRequest("note is required");
    const { createRecord } = await import("../services/clinical.service");
    const record = await createRecord(store, req.params.patientId!, { ...auditContext(req), actorRole: req.actor!.role }, {
      kind: "doctor-note",
      title: title ?? "Clinician note",
      summary: note.slice(0, 200),
      body: note,
    });
    res.status(201).json(record);
  }),
);
