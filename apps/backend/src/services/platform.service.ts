import {
  AI_ASSISTANT_DISCLAIMER,
  EMERGENCY_STATEMENT,
  KNOWLEDGE_ARTICLES,
  KNOWLEDGE_CATEGORIES,
  MEDICATION_DISCLAIMER,
  RED_FLAG_CATEGORIES,
  SIDE_EFFECT_GUIDANCE,
  SYMPTOM_CATALOGUE,
  articleBySlug,
  type KnowledgeArticle,
  type PlatformAnalytics,
  type DoctorDashboardStats,
  type RiskLevel,
  type TreatmentStatus,
} from "@breastcare/shared";
import type { Store } from "../db";
import { notFound } from "../lib/errors";
import { chainStatus, operatorAddress } from "../blockchain/client";
import { auditEntryCount, readAuditTrail, readPatientRegistration } from "../blockchain/service";
import { assertAccess, consentStatus, type AuditContext } from "./core.service";

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/*                                                                     */
/* Every figure here is an aggregate. No patient identifier, name or   */
/* clinical detail is ever included, so analytics can be shown on a    */
/* shared screen safely.                                               */
/* ------------------------------------------------------------------ */

function periodKey(date: string, monthsBack: number): string {
  const when = new Date(date);
  const now = new Date();
  const diff = (now.getFullYear() - when.getFullYear()) * 12 + (now.getMonth() - when.getMonth());
  if (diff > monthsBack) return "older";
  return when.toISOString().slice(0, 7);
}

export async function platformAnalytics(store: Store): Promise<PlatformAnalytics> {
  const [patients, assessments, treatments, appointments, logs, symptoms] = await Promise.all([
    store.patients.list(),
    store.riskAssessments.list(),
    store.treatments.list(),
    store.appointments.list(),
    store.nutritionLogs.list(),
    store.symptoms.list(),
  ]);

  const trendBuckets = new Map<string, { patients: number; assessments: number }>();
  for (const patient of patients) {
    const key = periodKey(patient.createdAt, 11);
    const bucket = trendBuckets.get(key) ?? { patients: 0, assessments: 0 };
    bucket.patients += 1;
    trendBuckets.set(key, bucket);
  }
  for (const assessment of assessments) {
    const key = periodKey(assessment.completedAt, 11);
    const bucket = trendBuckets.get(key) ?? { patients: 0, assessments: 0 };
    bucket.assessments += 1;
    trendBuckets.set(key, bucket);
  }

  const riskCounts: Record<RiskLevel, number> = { low: 0, moderate: 0, high: 0 };
  for (const assessment of assessments) riskCounts[assessment.level] += 1;

  const treatmentCounts = new Map<TreatmentStatus, number>();
  for (const treatment of treatments) {
    treatmentCounts.set(treatment.status, (treatmentCounts.get(treatment.status) ?? 0) + 1);
  }

  const adherenceBuckets = new Map<string, { followed: number; total: number }>();
  for (const log of logs) {
    const key = periodKey(log.loggedAt, 11);
    const bucket = adherenceBuckets.get(key) ?? { followed: 0, total: 0 };
    bucket.total += 1;
    if (log.adherence === "followed") bucket.followed += 1;
    else if (log.adherence === "partial") bucket.followed += 0.5;
    adherenceBuckets.set(key, bucket);
  }

  const appointmentBuckets = new Map<string, { scheduled: number; completed: number; cancelled: number }>();
  for (const appointment of appointments) {
    const key = periodKey(appointment.startsAt, 11);
    const bucket = appointmentBuckets.get(key) ?? { scheduled: 0, completed: 0, cancelled: 0 };
    bucket.scheduled += 1;
    if (appointment.status === "completed") bucket.completed += 1;
    if (appointment.status === "cancelled") bucket.cancelled += 1;
    appointmentBuckets.set(key, bucket);
  }

  const followUpBuckets = new Map<string, { due: number; done: number }>();
  for (const appointment of appointments) {
    const key = periodKey(appointment.startsAt, 11);
    const bucket = followUpBuckets.get(key) ?? { due: 0, done: 0 };
    bucket.due += 1;
    if (appointment.status === "completed") bucket.done += 1;
    followUpBuckets.set(key, bucket);
  }

  const symptomCounts = new Map<string, number>();
  for (const symptom of symptoms) symptomCounts.set(symptom.label, (symptomCounts.get(symptom.label) ?? 0) + 1);

  const sortedKeys = (keys: Iterable<string>) => [...keys].sort();

  return {
    patientTrend: sortedKeys(trendBuckets.keys()).map((period) => ({
      period,
      patients: trendBuckets.get(period)?.patients ?? 0,
      assessments: trendBuckets.get(period)?.assessments ?? 0,
    })),
    riskDistribution: (Object.keys(riskCounts) as RiskLevel[]).map((level) => ({ level, count: riskCounts[level] })),
    treatmentStatus: [...treatmentCounts.entries()].map(([status, count]) => ({ status, count })),
    nutritionAdherence: sortedKeys(adherenceBuckets.keys()).map((period) => {
      const bucket = adherenceBuckets.get(period)!;
      return { period, adherence: bucket.total ? Number((bucket.followed / bucket.total).toFixed(3)) : 0 };
    }),
    appointmentStats: sortedKeys(appointmentBuckets.keys()).map((period) => ({ period, ...appointmentBuckets.get(period)! })),
    followUpRates: sortedKeys(followUpBuckets.keys()).map((period) => {
      const bucket = followUpBuckets.get(period)!;
      return { period, rate: bucket.due ? Number((bucket.done / bucket.due).toFixed(3)) : 0 };
    }),
    symptomFrequency: [...symptomCounts.entries()]
      .map(([symptom, count]) => ({ symptom, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
  };
}

export async function doctorDashboardStats(store: Store, doctorId: string): Promise<DoctorDashboardStats> {
  const consents = await store.consents.list({ where: { granteeId: doctorId } });
  const activeConsents = consents.filter((consent) => consentStatus(consent) === "active");
  const authorizedPatientIds = [...new Set(activeConsents.map((consent) => consent.patientId))];

  const now = Date.now();
  const appointments = await store.appointments.list({ where: { doctorId } });
  const reports = await store.reports.list({ where: { doctorId } });

  let highRisk = 0;
  let requiringFollowUp = 0;
  let activePatients = 0;

  for (const patientId of authorizedPatientIds) {
    const assessments = await store.riskAssessments.list({ where: { patientId } });
    if (assessments.length > 0 && assessments[0]!.level === "high") highRisk += 1;

    const treatments = await store.treatments.list({ where: { patientId } });
    if (treatments.some((treatment) => treatment.status === "active")) activePatients += 1;

    const patientAppointments = appointments.filter((appointment) => appointment.patientId === patientId);
    const lastCompleted = patientAppointments
      .filter((appointment) => appointment.status === "completed")
      .sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1))[0];
    if (!lastCompleted || now - new Date(lastCompleted.startsAt).getTime() > 90 * 86_400_000) requiringFollowUp += 1;
  }

  return {
    totalPatients: authorizedPatientIds.length,
    activePatients,
    upcomingAppointments: appointments.filter((appointment) => new Date(appointment.startsAt) >= new Date(now) && appointment.status !== "cancelled").length,
    patientsRequiringFollowUp: requiringFollowUp,
    highRiskPatients: highRisk,
    reportsThisMonth: reports.filter((report) => new Date(report.createdAt).getMonth() === new Date().getMonth()).length,
    pendingConsentRequests: consents.filter((consent) => consent.status === "pending").length,
  };
}

/** Patient-facing summary card data. */
export async function patientOverview(store: Store, patientId: string, actor: AuditContext) {
  await assertAccess(store, actor, patientId);
  const [profile, assessments, symptoms, treatments, medications, appointments, plans, reports] = await Promise.all([
    store.patients.get(patientId),
    store.riskAssessments.list({ where: { patientId }, orderBy: "completedAt", order: "desc" }),
    store.symptoms.list({ where: { patientId }, orderBy: "reportedAt", order: "desc" }),
    store.treatments.list({ where: { patientId } }),
    store.medications.list({ where: { patientId } }),
    store.appointments.list({ where: { patientId }, orderBy: "startsAt", order: "asc" }),
    store.nutritionPlans.list({ where: { patientId }, orderBy: "createdAt", order: "desc" }),
    store.reports.list({ where: { patientId }, orderBy: "date", order: "desc" }),
  ]);

  const now = Date.now();
  const latest = assessments[0] ?? null;

  return {
    profile,
    latestAssessment: latest
      ? {
          id: latest.id,
          level: latest.level,
          urgency: latest.urgency,
          score: latest.score,
          maxScore: latest.maxScore,
          modelName: `${latest.modelId} v${latest.modelVersion}`,
          completedAt: latest.completedAt,
          redFlags: latest.redFlags,
        }
      : null,
    redFlagSymptoms: symptoms.filter((symptom) => symptom.redFlag).length,
    upcomingAppointments: appointments
      .filter((appointment) => new Date(appointment.startsAt).getTime() >= now && appointment.status !== "cancelled")
      .slice(0, 5),
    activeTreatments: treatments.filter((treatment) => treatment.status === "active" || treatment.status === "authorized"),
    activeMedications: medications.filter((medication) => medication.status === "active"),
    latestNutritionPlan: plans[0] ?? null,
    recentReports: reports.slice(0, 3),
    counts: {
      records: await store.records.count({ where: { patientId } }),
      symptoms: symptoms.length,
      assessments: assessments.length,
      treatments: treatments.length,
      medications: medications.length,
      appointments: appointments.length,
      reports: reports.length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export async function listNotifications(store: Store, userId: string) {
  return store.notifications.list({ where: { userId }, orderBy: "createdAt", order: "desc" });
}

export async function markNotificationRead(store: Store, userId: string, notificationId: string) {
  const notification = await store.notifications.get(notificationId);
  if (!notification || notification.userId !== userId) throw notFound("Notification not found");
  return store.notifications.update(notificationId, { readAt: new Date().toISOString() });
}

export async function markAllNotificationsRead(store: Store, userId: string) {
  const unread = (await store.notifications.list({ where: { userId } })).filter((notification) => !notification.readAt);
  for (const notification of unread) {
    await store.notifications.update(notification.id, { readAt: new Date().toISOString() });
  }
  return { updated: unread.length };
}

/* ------------------------------------------------------------------ */
/* Blockchain overview                                                 */
/* ------------------------------------------------------------------ */

export async function blockchainOverview(store: Store, patientId: string | null, actor: AuditContext) {
  // Access control runs before anything is read, and independently of chain availability:
  // an offline node must never widen who may see a patient's integrity records.
  if (patientId) await assertAccess(store, actor, patientId);

  const status = await chainStatus();
  const records = patientId
    ? await store.blockchainRecords.list({ where: { patientId }, orderBy: "createdAt", order: "desc" })
    : await store.blockchainRecords.list({ orderBy: "createdAt", order: "desc", limit: 100 });

  let registration = null;
  let trail: Awaited<ReturnType<typeof readAuditTrail>> = null;
  let entries: number | null = null;

  if (status.reachable && status.configured) {
    entries = await auditEntryCount();
    if (patientId) {
      const profile = await store.patients.get(patientId);
      if (profile) {
        registration = await readPatientRegistration(profile.onChainPatientId, profile.walletAddress);
        // Records are anchored under the pseudonymous id; registrations and consents under the
        // registry-derived id. Both belong to the same patient, so both trails are merged.
        const identifiers = [...new Set([profile.onChainPatientId, profile.pseudonymousId].filter(Boolean))] as string[];
        const trails = await Promise.all(identifiers.map((identifier) => readAuditTrail(identifier, 50)));
        const merged = trails
          .flatMap((entries) => entries ?? [])
          .sort((a, b) => a.entryId - b.entryId);
        trail = merged;
      }
    }
  }

  return {
    status: { ...status, operator: operatorAddress() },
    auditEntryCount: entries,
    registration,
    trail,
    records,
  };
}

/* ------------------------------------------------------------------ */
/* Knowledge centre                                                    */
/* ------------------------------------------------------------------ */

export function knowledgeCategories() {
  return KNOWLEDGE_CATEGORIES.map((category) => ({
    category,
    count: KNOWLEDGE_ARTICLES.filter((article) => article.category === category).length,
  }));
}

export function listArticles(category?: string): KnowledgeArticle[] {
  return category ? KNOWLEDGE_ARTICLES.filter((article) => article.category === category) : KNOWLEDGE_ARTICLES;
}

export function getArticle(slug: string): KnowledgeArticle {
  const article = articleBySlug(slug);
  if (!article) throw notFound("Article not found");
  return article;
}

export function redFlags() {
  return RED_FLAG_CATEGORIES;
}

/* ------------------------------------------------------------------ */
/* AI assistant                                                        */
/*                                                                     */
/* A retrieval-based educational assistant. It answers only from the   */
/* platform's own knowledge base and always states what it cannot do.  */
/* It never diagnoses, never adjusts medication and never advises      */
/* stopping treatment.                                                 */
/* ------------------------------------------------------------------ */

const DIAGNOSTIC_REQUEST = /\b(do i have|have i got|am i (dying|cancerous)|is it cancer|is this cancer|confirm (the )?cancer|diagnos(e|is) me|stage of my cancer)\b/i;
const MEDICATION_REQUEST = /\b(stop (taking|my)|increase (my|the) dose|reduce (my|the) dose|change (my|the) dose|prescribe|which (drug|medicine) should i take|skip my (dose|treatment))\b/i;
const URGENCY_KEYWORDS = ["bleeding", "fever", "temperature", "chest pain", "breathless", "short of breath", "confusion", "seizure", "emergency", "unbearable"];

export interface AssistantAnswer {
  answer: string;
  sources: { title: string; slug: string }[];
  refused: boolean;
  escalation: string | null;
  disclaimer: string;
}

export function askAssistant(question: string, context: string): AssistantAnswer {
  const trimmed = question.trim();
  const lower = trimmed.toLowerCase();

  const sources: { title: string; slug: string }[] = [];
  const escalation = URGENCY_KEYWORDS.some((keyword) => lower.includes(keyword)) ? EMERGENCY_STATEMENT : null;

  if (DIAGNOSTIC_REQUEST.test(lower)) {
    return {
      answer:
        "I can't diagnose cancer or tell you whether a symptom is cancer — only a qualified clinician can do that, after examining you and arranging any tests needed. What I can do is explain what your symptoms might mean in general terms, help you organise them before an appointment, and tell you what information your doctor is likely to ask for. If you have a new lump, a skin or nipple change, or anything that has persisted for a few weeks, please book an appointment rather than waiting.",
      sources: [{ title: "Symptoms and breast awareness", slug: "symptoms-and-breast-awareness" }],
      refused: true,
      escalation,
      disclaimer: AI_ASSISTANT_DISCLAIMER,
    };
  }

  if (MEDICATION_REQUEST.test(lower)) {
    return {
      answer: `I can't change, stop or prescribe medication. Dose decisions belong to your prescriber, and stopping a cancer treatment early can affect how well it works.\n\n${MEDICATION_DISCLAIMER}\n\nWhat I can do is explain what a medicine is generally used for, what side effects are commonly reported, and help you write down the questions to take to your next appointment or pharmacist call.`,
      sources: [{ title: "Treatment types and what they aim to do", slug: "treatment-types" }],
      refused: true,
      escalation,
      disclaimer: AI_ASSISTANT_DISCLAIMER,
    };
  }

  const parts: string[] = [];

  if (context === "symptoms" || /symptom|lump|nipple|discharge|dimpl|pain|swelling|rash/.test(lower)) {
    parts.push(
      "Breast symptoms have many possible causes and most are not cancer. What matters clinically is whether a change is new, persistent and changing — not whether it hurts.",
    );
    const matched = SYMPTOM_CATALOGUE.filter((symptom) => lower.includes(symptom.label.split(" ")[0]!.toLowerCase()) || lower.includes(symptom.code.split("-")[0]!));
    const list = matched.length > 0 ? matched : SYMPTOM_CATALOGUE.slice(0, 4);
    parts.push("Commonly reported changes and what they usually mean:\n" + list.map((symptom) => `• ${symptom.label} — ${symptom.guidance}`).join("\n"));
    parts.push("Preparing for an appointment: note when the change started, whether it is getting bigger or changing, which side it is on, anything that makes it better or worse, and any discharge or skin change.");
    sources.push({ title: "Symptoms and breast awareness", slug: "symptoms-and-breast-awareness" });
  }

  if (context === "nutrition" || /eat|diet|food|nutrition|nausea|appetite|constipat|diarrh|mouth|taste|fatigue/.test(lower)) {
    const matchedSideEffects = SIDE_EFFECT_GUIDANCE.filter((guidance) =>
      guidance.symptom.toLowerCase().split(/[\s-]/).some((word) => word.length > 3 && lower.includes(word.toLowerCase())),
    );
    if (matchedSideEffects.length > 0) {
      parts.push(
        matchedSideEffects
          .map(
            (guidance) =>
              `${guidance.symptom}: ${guidance.summary}\n• ${guidance.suggestions.slice(0, 3).join("\n• ")}\nContact your team: ${guidance.whenToContactCareTeam}`,
          )
          .join("\n\n"),
      );
    } else {
      parts.push(
        "Nutrition during cancer treatment aims to maintain weight and strength, support recovery between cycles and make side effects easier to manage. Needs vary with treatment type, stage, side effects, other health conditions and how your appetite and weight are changing.",
      );
      parts.push("Practical basics: eat regularly even in small amounts; include a protein source at each meal; keep fluids up; ask for an oncology dietitian referral if eating is difficult.");
    }
    parts.push("No diet cures cancer, and restrictive diets during treatment can cause harmful weight loss. Please review any significant dietary change with your team.");
    sources.push({ title: "Eating well during and after treatment", slug: "nutrition-during-treatment" });
  }

  if (context === "treatment" || /chemo|radi|radiother|surgery|hormone|targeted|immunother|mastectom|lumpectom/.test(lower)) {
    parts.push(
      "Treatment depends on tumour biology (hormone receptors, HER2), stage, your other health conditions and your preferences. A multidisciplinary team plans it with you.",
    );
    parts.push(
      "• Surgery: breast-conserving surgery or mastectomy, sometimes with reconstruction.\n• Radiotherapy: treats the breast or chest wall area after surgery.\n• Chemotherapy: systemic treatment given in cycles.\n• Hormone (endocrine) therapy: for hormone-receptor-positive cancers, usually taken for several years.\n• Targeted therapy: used when a specific target such as HER2 is present.\n• Immunotherapy: used in selected situations.",
    );
    parts.push("Good questions to ask: what is the aim of this treatment? What are the common and serious side effects? How will we know if it is working? What happens if I delay or decline it?");
    sources.push({ title: "Treatment types and what they aim to do", slug: "treatment-types" });
  }

  if (context === "terminology" || /what (is|does|are)|mean|terminology|explain|definition|grade|stage|receptor|her2|node|biopsy|mammog/.test(lower)) {
    parts.push(
      "Some terms you may come across:\n• Stage — how far a cancer has spread; combines tumour size, lymph-node involvement and any spread elsewhere.\n• Grade — how different the cells look from normal cells.\n• Hormone receptor status — whether the cancer has oestrogen or progesterone receptors, which determines whether hormone therapy can help.\n• HER2 — a protein that some cancers over-produce; targeted therapy exists for these.\n• Triple negative — no oestrogen or progesterone receptors and no HER2 over-expression.\n• Sentinel node biopsy — removal of the first lymph nodes that drain the breast, to check for spread.\n• Neoadjuvant — treatment given before surgery; adjuvant — treatment given after surgery.",
    );
    sources.push({ title: "Breast cancer: a plain-language overview", slug: "breast-cancer-basics" });
  }

  if (context === "appointments" || /appointment|question for (my )?doctor|consult|clinic|prepare/.test(lower)) {
    parts.push(
      "Before an appointment it helps to write down: when each symptom started and how it has changed; every medicine and supplement you take, with doses; previous surgeries, biopsies or cancers; breast cancer, ovarian or pancreatic cancer in your family and at what ages; and the questions you want answered.",
    );
    parts.push(
      "Useful questions: what do you think this is? What tests will confirm it? How urgent is it? Who do I contact if things change before my next visit? Can I bring someone with me?",
    );
    sources.push({ title: "How breast cancer is diagnosed", slug: "diagnosis-process" });
  }

  if (parts.length === 0) {
    parts.push(
      "I can help you understand medical terms, nutrition during and after treatment, treatment vocabulary, and how to prepare for appointments. I can also help you organise symptoms before a consultation.",
    );
    parts.push(
      `Topics available: ${KNOWLEDGE_CATEGORIES.join(", ")}.`,
    );
    sources.push({ title: "Frequently asked questions", slug: "faq" });
  }

  if (escalation) {
    parts.push(`Because you mentioned something that can be urgent: ${escalation}`);
  }

  return {
    answer: parts.join("\n\n"),
    sources,
    refused: false,
    escalation,
    disclaimer: AI_ASSISTANT_DISCLAIMER,
  };
}
