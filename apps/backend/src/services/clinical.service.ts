import {
  getActiveRiskModel,
  listRiskModels,
  symptomDefinition,
  SYMPTOM_CATALOGUE,
  type RiskAssessmentInput,
  RISK_ASSESSMENT_DISCLAIMER,
} from "@breastcare/shared";
import type {
  Appointment,
  ConsentRecord,
  MedicalRecordEntry,
  MedicalRecordKind,
  MedicalReport,
  RiskAssessmentRecord,
  SymptomReport,
  TimelineEvent,
} from "@breastcare/shared";
import type { Store } from "../db";
import { notFound } from "../lib/errors";
import { bytes32, contentHash, newId } from "../lib/crypto";
import { audit, assertAccess, consentStatus, type AuditContext } from "./core.service";
import * as chain from "../blockchain/service";

/* ------------------------------------------------------------------ */
/* Medical records                                                     */
/* ------------------------------------------------------------------ */

export interface RecordDraft {
  kind: MedicalRecordKind;
  title: string;
  summary: string;
  body: string;
  attachments?: { name: string; contentHash: string }[];
}

/**
 * Create a medical record, hash it and anchor the hash on-chain.
 *
 * The record body never leaves this database; only its digest is written to the chain.
 */
export async function createRecord(
  store: Store,
  patientId: string,
  actor: AuditContext,
  draft: RecordDraft,
): Promise<MedicalRecordEntry> {
  const patient = await store.patients.get(patientId);
  if (!patient) throw notFound("Patient not found");

  const now = new Date().toISOString();
  const id = newId("REC");
  const hashPayload = { kind: draft.kind, title: draft.title, summary: draft.summary, body: draft.body, patientId: patient.pseudonymousId };
  const hash = contentHash(hashPayload);

  const record: MedicalRecordEntry = {
    id,
    patientId,
    kind: draft.kind,
    title: draft.title,
    summary: draft.summary,
    body: draft.body,
    attachments: draft.attachments ?? [],
    recordedById: actor.actorId,
    contentHash: `0x${hash}`,
    onChainRecordId: null,
    verifiedAt: null,
    lastVerification: null,
    createdAt: now,
    updatedAt: now,
  };

  const created = await store.records.insert(record);

  const anchor = await chain.anchorRecordHash({
    patientId: patient.pseudonymousId,
    recordId: bytes32(id),
    recordType: bytes32(draft.kind),
    contentHash: record.contentHash,
    locatorHash: bytes32({ store: "off-chain-secure", id }),
  });

  const withAnchor = anchor.transactionHash
    ? await store.records.update(id, { onChainRecordId: bytes32(id) })
    : created;

  await store.blockchainRecords.insert({
    id: newId("BCH"),
    patientId,
    kind: "record-hash",
    label: `${draft.kind}: ${draft.title}`,
    dataHash: record.contentHash,
    contract: "MedicalRecordRegistry",
    transactionHash: anchor.transactionHash,
    blockNumber: anchor.blockNumber,
    status: anchor.anchored ? "confirmed" : "unanchored",
    verification: "unverified",
    createdAt: now,
    confirmedAt: anchor.anchored ? now : null,
  });

  await audit(store, actor, "RECORD_CREATED", { patientId, resource: "record", resourceId: id, dataHash: record.contentHash });
  return withAnchor;
}

export async function listRecords(store: Store, patientId: string, actor: AuditContext): Promise<MedicalRecordEntry[]> {
  await assertAccess(store, actor, patientId);
  const records = await store.records.list({ where: { patientId }, orderBy: "createdAt", order: "desc" });
  await audit(store, actor, "RECORD_LIST_READ", { patientId, resource: "record" });
  return records;
}

/**
 * Verify a record's integrity:
 *   1. recompute the hash from the stored record and compare with the stored hash,
 *   2. compare the stored hash with the hash anchored on-chain.
 * A mismatch in either step means the record has been altered since it was written.
 */
export async function verifyRecord(
  store: Store,
  recordId: string,
  actor: AuditContext,
): Promise<{
  record: MedicalRecordEntry;
  localHash: string;
  storedHash: string;
  localMatches: boolean;
  onChain: Awaited<ReturnType<typeof chain.verifyRecordOnChain>>;
}> {
  const record = await store.records.get(recordId);
  if (!record) throw notFound("Record not found");
  await assertAccess(store, actor, record.patientId);

  const recomputed = `0x${contentHash({
    kind: record.kind,
    title: record.title,
    summary: record.summary,
    body: record.body,
    patientId: (await store.patients.get(record.patientId))?.pseudonymousId ?? "",
  })}`;

  const onChain = await chain.verifyRecordOnChain(record.onChainRecordId ?? bytes32(record.id), recomputed);
  const localMatches = recomputed === record.contentHash;

  await store.records.update(recordId, {
    verifiedAt: new Date().toISOString(),
    lastVerification: { matches: localMatches && (!onChain.verified || onChain.matches), checkedAt: new Date().toISOString(), onChainHash: onChain.onChainHash ?? "" },
  });

  await audit(store, actor, localMatches ? "RECORD_VERIFIED_OK" : "RECORD_VERIFIED_MISMATCH", {
    patientId: record.patientId,
    resource: "record",
    resourceId: recordId,
    dataHash: recomputed,
  });

  return { record, localHash: recomputed, storedHash: record.contentHash, localMatches, onChain };
}

/* ------------------------------------------------------------------ */
/* Symptoms                                                            */
/* ------------------------------------------------------------------ */

export function symptomCatalogue() {
  return SYMPTOM_CATALOGUE.map(({ code, label, description }) => ({ code, label, description }));
}

export async function reportSymptom(
  store: Store,
  patientId: string,
  actor: AuditContext,
  input: { code: string; severity: SymptomReport["severity"]; side: SymptomReport["side"]; durationWeeks: number; progressive: boolean; notes?: string | null },
): Promise<SymptomReport> {
  const definition = symptomDefinition(input.code);
  if (!definition) throw notFound(`Unknown symptom code "${input.code}"`);

  const redFlag = Boolean(definition.redFlagPattern?.({
    code: input.code,
    label: definition.label,
    durationWeeks: input.durationWeeks,
    unilateral: input.side === "left" || input.side === "right",
    progressive: input.progressive,
    severe: input.severity === "severe",
  }));

  const report: SymptomReport = {
    id: newId("SYM"),
    patientId,
    code: input.code as SymptomReport["code"],
    label: definition.label,
    severity: input.severity,
    side: input.side,
    durationWeeks: input.durationWeeks,
    progressive: input.progressive,
    notes: input.notes ?? null,
    reportedAt: new Date().toISOString(),
    guidance: definition.guidance,
    redFlag,
    reviewedByDoctorId: null,
    reviewedAt: null,
    createdAt: new Date().toISOString(),
  };

  const created = await store.symptoms.insert(report);

  // A symptom report is part of the medical record, so its digest is anchored too.
  await createRecord(store, patientId, actor, {
    kind: "symptom",
    title: `Symptom reported: ${definition.label}`,
    summary: `${definition.label} — ${input.severity}, ${input.durationWeeks} week(s)${input.progressive ? ", progressive" : ""}.`,
    body: [
      `Symptom: ${definition.label}`,
      `Severity: ${input.severity}`,
      `Side: ${input.side}`,
      `Duration: ${input.durationWeeks} week(s)`,
      `Progressive: ${input.progressive ? "yes" : "no"}`,
      input.notes ? `Notes: ${input.notes}` : null,
      redFlag ? "Flagged for prompt clinical evaluation." : null,
      `Educational guidance: ${definition.guidance}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  await audit(store, actor, "SYMPTOM_REPORTED", { patientId, resource: "symptom", resourceId: created.id });
  return created;
}

export async function listSymptoms(store: Store, patientId: string, actor: AuditContext): Promise<SymptomReport[]> {
  await assertAccess(store, actor, patientId);
  return store.symptoms.list({ where: { patientId }, orderBy: "reportedAt", order: "desc" });
}

/* ------------------------------------------------------------------ */
/* Risk assessment                                                     */
/* ------------------------------------------------------------------ */

export function availableRiskModels() {
  return listRiskModels();
}

export async function completeRiskAssessment(
  store: Store,
  patientId: string,
  actor: AuditContext,
  input: RiskAssessmentInput,
): Promise<RiskAssessmentRecord> {
  const patient = await store.patients.get(patientId);
  if (!patient) throw notFound("Patient not found");

  const model = getActiveRiskModel();
  const result = model.evaluate(input);
  const now = new Date().toISOString();
  const id = newId("RSK");

  const assessment: RiskAssessmentRecord = {
    id,
    patientId,
    modelId: result.modelId,
    modelVersion: result.modelVersion,
    level: result.level,
    score: result.score,
    maxScore: result.maxScore,
    normalizedScore: result.normalizedScore,
    urgency: result.urgency,
    input,
    factors: result.factors,
    guidance: result.guidance,
    redFlags: result.redFlags,
    disclaimer: RISK_ASSESSMENT_DISCLAIMER,
    contentHash: `0x${contentHash({ model: result.modelId, version: result.modelVersion, input, level: result.level, score: result.score })}`,
    onChainRecordId: null,
    completedAt: now,
    reviewedByDoctorId: null,
    doctorNote: null,
    createdAt: now,
  };

  const created = await store.riskAssessments.insert(assessment);

  const record = await createRecord(store, patientId, actor, {
    kind: "risk-assessment",
    title: `Risk assessment completed (${result.level})`,
    summary: `AI-assisted educational assessment — ${result.level} risk indicator. Not a diagnosis.`,
    body: [
      `Model: ${result.modelName}`,
      `Score: ${result.score} / ${result.maxScore}`,
      `Urgency guidance: ${result.urgency}`,
      "",
      "Contributing factors:",
      ...result.factors.map((factor) => `- ${factor.label} (${factor.category}, ${factor.points} pts): ${factor.explanation}`),
      "",
      "Guidance:",
      ...result.guidance.map((line) => `- ${line}`),
      "",
      ...result.redFlags.map((flag) => `RED FLAG: ${flag}`),
      "",
      ...result.disclaimers.map((line) => `Disclaimer: ${line}`),
    ].join("\n"),
  });

  const updated = await store.riskAssessments.update(id, { onChainRecordId: record.onChainRecordId });

  // Clinicians who hold consent are told when a result needs their attention.
  if (result.urgency !== "routine" || result.redFlags.length > 0) {
    const consents = await store.consents.list({ where: { patientId } });
    for (const consent of consents) {
      if (consentStatus(consent) !== "active") continue;
      await store.notifications.insert({
        id: newId("NTF"),
        userId: consent.granteeId,
        kind: "new-report",
        title: "Risk assessment needs review",
        body: `${patient.displayName} completed an assessment with a ${result.level} risk indicator${result.redFlags.length ? " and reported symptoms that warrant prompt evaluation" : ""}.`,
        readAt: null,
        actionLabel: "Review",
        actionHref: `/doctor/patients/${patientId}/risk`,
        severity: result.level === "high" ? "critical" : "warning",
        createdAt: now,
      });
    }
  }

  await audit(store, actor, "RISK_ASSESSMENT_COMPLETED", {
    patientId,
    resource: "risk-assessment",
    resourceId: id,
    dataHash: assessment.contentHash,
  });
  return updated;
}

export async function listRiskAssessments(store: Store, patientId: string, actor: AuditContext): Promise<RiskAssessmentRecord[]> {
  await assertAccess(store, actor, patientId);
  return store.riskAssessments.list({ where: { patientId }, orderBy: "completedAt", order: "desc" });
}

/* ------------------------------------------------------------------ */
/* Medical reports                                                     */
/* ------------------------------------------------------------------ */

export async function createReport(
  store: Store,
  patientId: string,
  actor: AuditContext & { role: string },
  input: {
    title: string;
    date: string;
    clinicalNotes: string;
    assessment: string;
    treatmentInformation?: string;
    recommendations: string;
    followUpDate?: string | null;
  },
): Promise<MedicalReport> {
  await assertAccess(store, { id: actor.actorId, role: actor.role as "doctor" }, patientId);
  const patient = await store.patients.get(patientId);
  if (!patient) throw notFound("Patient not found");

  const now = new Date().toISOString();
  const id = newId("RPT");
  const hash = `0x${contentHash({ patientId: patient.pseudonymousId, ...input })}`;

  const report: MedicalReport = {
    id,
    patientId,
    doctorId: actor.actorId,
    title: input.title,
    date: input.date,
    clinicalNotes: input.clinicalNotes,
    assessment: input.assessment,
    treatmentInformation: input.treatmentInformation ?? "",
    recommendations: input.recommendations,
    followUpDate: input.followUpDate ?? null,
    contentHash: hash,
    onChainRecordId: null,
    lastVerification: null,
    createdAt: now,
    updatedAt: now,
  };

  const created = await store.reports.insert(report);

  // The report is also stored as a medical record and anchored on-chain.
  const record = await createRecord(store, patientId, actor, {
    kind: "report",
    title: `Report: ${input.title}`,
    summary: input.assessment.slice(0, 300),
    body: [
      `Date: ${input.date}`,
      "",
      "Clinical notes:",
      input.clinicalNotes,
      "",
      "Assessment:",
      input.assessment,
      "",
      "Treatment information:",
      input.treatmentInformation || "None recorded",
      "",
      "Recommendations:",
      input.recommendations,
      "",
      input.followUpDate ? `Follow-up: ${input.followUpDate}` : "Follow-up: not scheduled",
    ].join("\n"),
  });

  await store.reports.update(id, { onChainRecordId: record.onChainRecordId });

  await store.notifications.insert({
    id: newId("NTF"),
    userId: patientId,
    kind: "new-report",
    title: "A new medical report is available",
    body: `${input.title} has been added to your record.`,
    readAt: null,
    actionLabel: "View report",
    actionHref: `/patient/reports`,
    severity: "info",
    createdAt: now,
  });

  await audit(store, actor, "REPORT_CREATED", { patientId, resource: "report", resourceId: id, dataHash: hash });
  return { ...created, onChainRecordId: record.onChainRecordId };
}

export async function listReports(store: Store, patientId: string, actor: AuditContext): Promise<MedicalReport[]> {
  await assertAccess(store, actor, patientId);
  return store.reports.list({ where: { patientId }, orderBy: "date", order: "desc" });
}

export async function verifyReport(store: Store, reportId: string, actor: AuditContext) {
  const report = await store.reports.get(reportId);
  if (!report) throw notFound("Report not found");
  await assertAccess(store, actor, report.patientId);

  const patient = await store.patients.get(report.patientId);
  const recomputed = `0x${contentHash({
    patientId: patient?.pseudonymousId ?? "",
    title: report.title,
    date: report.date,
    clinicalNotes: report.clinicalNotes,
    assessment: report.assessment,
    treatmentInformation: report.treatmentInformation,
    recommendations: report.recommendations,
    followUpDate: report.followUpDate,
  })}`;

  const onChain = await chain.verifyRecordOnChain(report.onChainRecordId ?? bytes32(report.id), recomputed);
  const localMatches = recomputed === report.contentHash;

  await store.reports.update(reportId, {
    lastVerification: {
      matches: localMatches && (!onChain.verified || onChain.matches),
      checkedAt: new Date().toISOString(),
      onChainHash: onChain.onChainHash ?? "",
    },
  });

  await audit(store, actor, localMatches ? "REPORT_VERIFIED_OK" : "REPORT_VERIFIED_MISMATCH", {
    patientId: report.patientId,
    resource: "report",
    resourceId: reportId,
    dataHash: recomputed,
  });

  return { report, localHash: recomputed, localMatches, onChain };
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

export async function buildTimeline(store: Store, patientId: string, actor: AuditContext): Promise<TimelineEvent[]> {
  await assertAccess(store, actor, patientId);

  const [records, symptoms, assessments, reports, treatments, appointments, plans, consents] = await Promise.all([
    store.records.list({ where: { patientId } }),
    store.symptoms.list({ where: { patientId } }),
    store.riskAssessments.list({ where: { patientId } }),
    store.reports.list({ where: { patientId } }),
    store.treatments.list({ where: { patientId } }),
    store.appointments.list({ where: { patientId } }),
    store.nutritionPlans.list({ where: { patientId } }),
    store.consents.list({ where: { patientId } }),
  ]);

  const events: TimelineEvent[] = [];

  for (const record of records as MedicalRecordEntry[]) {
    events.push({
      id: record.id,
      patientId,
      occurredAt: record.createdAt,
      kind: record.kind,
      title: record.title,
      description: record.summary,
      actor: record.recordedById === patientId ? "You" : "Your care team",
      contentHash: record.contentHash,
      recordId: record.id,
    });
  }
  for (const symptom of symptoms) {
    events.push({
      id: symptom.id,
      patientId,
      occurredAt: symptom.reportedAt,
      kind: "symptom",
      title: `Symptom reported: ${symptom.label}`,
      description: `${symptom.severity} severity, present for ${symptom.durationWeeks} week(s).${symptom.redFlag ? " Flagged for prompt evaluation." : ""}`,
      actor: "You",
      contentHash: null,
      recordId: symptom.id,
    });
  }
  for (const assessment of assessments) {
    events.push({
      id: assessment.id,
      patientId,
      occurredAt: assessment.completedAt,
      kind: "risk-assessment",
      title: "Risk assessment completed",
      description: `${assessment.level} risk indicator (${assessment.modelId} v${assessment.modelVersion}). Educational assessment, not a diagnosis.`,
      actor: "You",
      contentHash: assessment.contentHash,
      recordId: assessment.id,
    });
  }
  for (const report of reports) {
    events.push({
      id: report.id,
      patientId,
      occurredAt: report.date,
      kind: "report",
      title: `Report: ${report.title}`,
      description: report.assessment.slice(0, 200),
      actor: "Your care team",
      contentHash: report.contentHash,
      recordId: report.id,
    });
  }
  for (const treatment of treatments) {
    events.push({
      id: treatment.id,
      patientId,
      occurredAt: treatment.updatedAt ?? treatment.createdAt,
      kind: "treatment",
      title: `Treatment ${treatment.status}: ${treatment.name}`,
      description: `${treatment.modality} — ${treatment.summary.slice(0, 200)}`,
      actor: "Your care team",
      contentHash: treatment.contentHash,
      recordId: treatment.id,
    });
  }
  for (const appointment of appointments as Appointment[]) {
    events.push({
      id: appointment.id,
      patientId,
      occurredAt: appointment.startsAt,
      kind: "appointment",
      title: `Appointment ${appointment.status}: ${appointment.reason}`,
      description: `${appointment.modality === "telehealth" ? "Telehealth" : "In person"}${appointment.location ? ` — ${appointment.location}` : ""}`,
      actor: appointment.doctorId === patientId ? "You" : "Your care team",
      contentHash: null,
      recordId: appointment.id,
    });
  }
  for (const plan of plans) {
    events.push({
      id: plan.id,
      patientId,
      occurredAt: plan.updatedAt ?? plan.createdAt,
      kind: "nutrition",
      title: `Nutrition plan updated: ${plan.title}`,
      description: `${plan.phase.replace(/-/g, " ")} — ${plan.meals.length} meal suggestions, ${plan.goals.length} goals.`,
      actor: plan.createdBy === patientId ? "You" : "Your care team",
      contentHash: plan.contentHash,
      recordId: plan.id,
    });
  }
  for (const consent of consents as ConsentRecord[]) {
    events.push({
      id: consent.id,
      patientId,
      occurredAt: consent.revokedAt ?? consent.grantedAt,
      kind: "consent",
      title: consent.revokedAt ? `Consent revoked: ${consent.granteeName}` : `Consent granted: ${consent.granteeName}`,
      description: `${consent.scopeName} — ${consent.scopeDescription}`,
      actor: "You",
      contentHash: consent.scopeHash,
      recordId: consent.id,
    });
  }

  return events.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
}
