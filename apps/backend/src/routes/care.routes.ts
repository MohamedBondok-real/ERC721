import { Router } from "express";
import { appointmentSchema, doseLogSchema, medicationSchema, treatmentPlanSchema } from "@breastcare/shared";
import { getStore } from "../db";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { asyncHandler, auditContext, authenticate, requireRole, validateBody } from "../middleware/http";
import {
  createMedication,
  createTreatmentPlan,
  doctorAvailability,
  getTreatment,
  listAppointments,
  listMedications,
  listTreatments,
  recordDose,
  requestAppointment,
  setAppointmentStatus,
  upcomingDoses,
  updateTreatmentStatus,
} from "../services/care.service";
import { assertAccess } from "../services/core.service";

export const careRouter = Router();

/* ---------------- treatments ---------------- */

careRouter.get(
  "/treatments",
  authenticate,
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = req.query.patientId as string | undefined;
    if (!patientId) throw badRequest("patientId is required");
    res.json({ treatments: await listTreatments(store, patientId, auditContext(req)) });
  }),
);

careRouter.get(
  "/treatments/:id",
  authenticate,
  asyncHandler(async (req, res) => {
    const store = getStore();
    res.json(await getTreatment(store, req.params.id!, auditContext(req)));
  }),
);

careRouter.post(
  "/treatments",
  authenticate,
  requireRole("doctor"),
  validateBody(treatmentPlanSchema),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = (req.body as { patientId?: string }).patientId ?? (req.query.patientId as string | undefined);
    if (!patientId) throw badRequest("patientId is required to create a treatment plan");
    const plan = await createTreatmentPlan(store, patientId, { ...auditContext(req), role: req.actor!.role }, req.body as never);
    res.status(201).json(plan);
  }),
);

careRouter.patch(
  "/treatments/:id/status",
  authenticate,
  requireRole("doctor", "admin"),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const { status, note } = req.body as { status?: string; note?: string };
    if (!status) throw badRequest("status is required");
    const updated = await updateTreatmentStatus(store, req.params.id!, { ...auditContext(req), role: req.actor!.role }, status as never, note ?? "");
    res.json(updated);
  }),
);

/* ---------------- medications ---------------- */

careRouter.get(
  "/medications",
  authenticate,
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = req.query.patientId as string | undefined;
    if (!patientId) throw badRequest("patientId is required");
    const medications = await listMedications(store, patientId, auditContext(req));
    res.json({ medications, upcomingDoses: upcomingDoses(medications) });
  }),
);

careRouter.post(
  "/medications",
  authenticate,
  requireRole("doctor"),
  validateBody(medicationSchema),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = (req.body as { patientId?: string }).patientId ?? (req.query.patientId as string | undefined);
    if (!patientId) throw badRequest("patientId is required to prescribe a medication");
    const medication = await createMedication(store, patientId, { ...auditContext(req), role: req.actor!.role }, req.body as never);
    res.status(201).json(medication);
  }),
);

careRouter.patch(
  "/medications/:id",
  authenticate,
  requireRole("doctor"),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const medication = await store.medications.get(req.params.id!);
    if (!medication) throw notFound("Medication not found");
    await assertAccess(store, { id: req.actor!.id, role: req.actor!.role }, medication.patientId);
    // Only the prescriber may change clinical fields; doses are never changed by patients.
    const updated = await store.medications.update(req.params.id!, req.body as never);
    res.json(updated);
  }),
);

careRouter.post(
  "/medications/dose",
  authenticate,
  validateBody(doseLogSchema),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const body = req.body as { medicationId: string; doseId: string; status: "taken" | "missed" | "skipped"; note?: string | null };
    if (req.actor!.role !== "patient" || !req.actor!.patientId) throw forbidden("Only patient accounts can record doses");
    const medication = await recordDose(store, req.actor!.patientId, auditContext(req), body);
    res.json(medication);
  }),
);

/* ---------------- appointments ---------------- */

careRouter.get(
  "/appointments",
  authenticate,
  asyncHandler(async (req, res) => {
    const store = getStore();
    const actor = req.actor!;
    const patientId = req.query.patientId as string | undefined;
    const doctorId = req.query.doctorId as string | undefined;

    if (actor.role === "patient") {
      res.json(await listAppointments(store, { patientId: actor.patientId! }, auditContext(req)));
      return;
    }
    if (actor.role === "doctor") {
      res.json(await listAppointments(store, { doctorId: doctorId ?? actor.doctorId! }, auditContext(req)));
      return;
    }
    if (patientId) {
      res.json(await listAppointments(store, { patientId }, auditContext(req)));
      return;
    }
    throw badRequest("Provide patientId or doctorId");
  }),
);

careRouter.post(
  "/appointments",
  authenticate,
  validateBody(appointmentSchema),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const actor = req.actor!;
    const body = req.body as never as Parameters<typeof requestAppointment>[3];
    if (actor.role === "patient" && !actor.patientId) throw notFound("No patient profile");
    const patientId = actor.role === "patient" ? actor.patientId! : ((req.body as { patientId?: string }).patientId ?? "");
    if (!patientId) throw badRequest("patientId is required");
    const appointment = await requestAppointment(store, patientId, auditContext(req), body);
    res.status(201).json(appointment);
  }),
);

careRouter.patch(
  "/appointments/:id/status",
  authenticate,
  asyncHandler(async (req, res) => {
    const store = getStore();
    const { status } = req.body as { status?: string };
    if (!status) throw badRequest("status is required");
    const appointment = await setAppointmentStatus(store, req.params.id!, { ...auditContext(req), role: req.actor!.role }, status as never);
    res.json(appointment);
  }),
);

careRouter.get(
  "/availability",
  authenticate,
  asyncHandler(async (req, res) => {
    const store = getStore();
    const doctorId = req.query.doctorId as string;
    if (!doctorId) throw badRequest("doctorId is required");
    const days = Math.min(Number(req.query.days ?? 7), 21);
    res.json({ slots: await doctorAvailability(store, doctorId, days) });
  }),
);
