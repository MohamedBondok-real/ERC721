import { Router } from "express";
import {
  medicalRecordSchema,
  medicalReportSchema,
  nutritionLogSchema,
  nutritionPlanInputSchema,
  paginationSchema,
  riskAssessmentInputSchema,
  symptomReportSchema,
} from "@breastcare/shared";
import { getStore } from "../db";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { asyncHandler, auditContext, authenticate, requireRole, validateBody } from "../middleware/http";
import {
  availableRiskModels,
  buildTimeline,
  completeRiskAssessment,
  createRecord,
  createReport,
  listRecords,
  listReports,
  listRiskAssessments,
  listSymptoms,
  reportSymptom,
  symptomCatalogue,
  verifyRecord,
  verifyReport,
} from "../services/clinical.service";
import {
  createNutritionPlan,
  listNutritionPlans,
  logNutritionEntry,
  nutritionAdherence,
} from "../services/care.service";
import { patientOverview } from "../services/platform.service";
import { decideAccess } from "../services/core.service";

export const patientRouter = Router();
patientRouter.use(authenticate);

/** Resolve the patient id for the caller, rejecting cross-patient access early. */
function patientScope(req: { actor?: { role: string; patientId: string | null; id: string } }, paramId?: string): string {
  const actor = req.actor!;
  if (actor.role === "patient") {
    if (!actor.patientId) throw notFound("No patient profile is linked to this account");
    if (paramId && paramId !== actor.patientId) throw forbidden("You can only access your own record");
    return actor.patientId;
  }
  if (!paramId) throw badRequest("A patient id is required");
  return paramId;
}

/* ---------------- dashboard ---------------- */

patientRouter.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = patientScope(req, req.query.patientId as string | undefined);
    res.json(await patientOverview(store, patientId, auditContext(req)));
  }),
);

patientRouter.get(
  "/timeline",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = patientScope(req, req.query.patientId as string | undefined);
    res.json({ events: await buildTimeline(store, patientId, auditContext(req)) });
  }),
);

/* ---------------- records ---------------- */

patientRouter.get(
  "/records",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = patientScope(req, req.query.patientId as string | undefined);
    res.json({ records: await listRecords(store, patientId, auditContext(req)) });
  }),
);

patientRouter.post(
  "/records",
  validateBody(medicalRecordSchema),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = patientScope(req);
    const record = await createRecord(store, patientId, auditContext(req), req.body as never);
    res.status(201).json(record);
  }),
);

patientRouter.post(
  "/records/:recordId/verify",
  asyncHandler(async (req, res) => {
    const store = getStore();
    res.json(await verifyRecord(store, req.params.recordId!, auditContext(req)));
  }),
);

/* ---------------- symptoms ---------------- */

patientRouter.get("/symptoms/catalogue", (_req, res) => {
  res.json({ symptoms: symptomCatalogue() });
});

patientRouter.get(
  "/symptoms",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = patientScope(req, req.query.patientId as string | undefined);
    res.json({ symptoms: await listSymptoms(store, patientId, auditContext(req)) });
  }),
);

patientRouter.post(
  "/symptoms",
  validateBody(symptomReportSchema),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = patientScope(req);
    const symptom = await reportSymptom(store, patientId, auditContext(req), req.body as never);
    res.status(201).json(symptom);
  }),
);

/* ---------------- risk assessment ---------------- */

patientRouter.get("/risk-assessment/models", (_req, res) => {
  res.json({ models: availableRiskModels() });
});

patientRouter.get(
  "/risk-assessment",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = patientScope(req, req.query.patientId as string | undefined);
    res.json({ assessments: await listRiskAssessments(store, patientId, auditContext(req)) });
  }),
);

patientRouter.post(
  "/risk-assessment",
  validateBody(riskAssessmentInputSchema),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = patientScope(req);
    const assessment = await completeRiskAssessment(store, patientId, auditContext(req), req.body as never);
    res.status(201).json(assessment);
  }),
);

/* ---------------- nutrition ---------------- */

patientRouter.get(
  "/nutrition",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = patientScope(req, req.query.patientId as string | undefined);
    const query = paginationSchema.parse(req.query);
    const plans = await listNutritionPlans(store, patientId, auditContext(req));
    const adherence = await nutritionAdherence(store, patientId);
    res.json({ plans: plans.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), adherence });
  }),
);

patientRouter.post(
  "/nutrition/plans",
  validateBody(nutritionPlanInputSchema),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = patientScope(req);
    const plan = await createNutritionPlan(store, patientId, auditContext(req), req.body as never);
    res.status(201).json(plan);
  }),
);

patientRouter.post(
  "/nutrition/logs",
  validateBody(nutritionLogSchema),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = patientScope(req, req.query.patientId as string | undefined);
    const entry = await logNutritionEntry(store, patientId, auditContext(req), req.body as never);
    res.status(201).json(entry);
  }),
);

patientRouter.get(
  "/nutrition/adherence",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = patientScope(req, req.query.patientId as string | undefined);
    const days = Number(req.query.days ?? 30);
    res.json(await nutritionAdherence(store, patientId, days));
  }),
);

/* ---------------- reports ---------------- */

patientRouter.get(
  "/reports",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = patientScope(req, req.query.patientId as string | undefined);
    res.json({ reports: await listReports(store, patientId, auditContext(req)) });
  }),
);

patientRouter.post(
  "/reports",
  requireRole("doctor"),
  validateBody(medicalReportSchema),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = (req.body as { patientId?: string }).patientId ?? (req.query.patientId as string | undefined);
    if (!patientId) throw badRequest("patientId is required to create a report");
    const report = await createReport(store, patientId, { ...auditContext(req), role: req.actor!.role }, req.body as never);
    res.status(201).json(report);
  }),
);

patientRouter.post(
  "/reports/:reportId/verify",
  asyncHandler(async (req, res) => {
    const store = getStore();
    res.json(await verifyReport(store, req.params.reportId!, auditContext(req)));
  }),
);

/* ---------------- access check helper used by the UI ---------------- */

patientRouter.get(
  "/access",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patientId = req.query.patientId as string;
    if (!patientId) throw badRequest("patientId is required");
    res.json(await decideAccess(store, { id: req.actor!.id, role: req.actor!.role }, patientId));
  }),
);
