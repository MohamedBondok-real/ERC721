import { buildNutritionPlan, type NutritionPlanInput } from "@breastcare/shared";
import type {
  Appointment,
  DoctorAvailabilitySlot,
  Medication,
  NutritionLogEntry,
  NutritionPlan,
  TreatmentPlanRecord,
  TreatmentStatus,
} from "@breastcare/shared";
import type { Store } from "../db";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { bytes32, contentHash, newId } from "../lib/crypto";
import { audit, assertAccess, notify, type AuditContext } from "./core.service";
import { createRecord } from "./clinical.service";
import * as chain from "../blockchain/service";

/* ------------------------------------------------------------------ */
/* Nutrition                                                           */
/* ------------------------------------------------------------------ */

export async function createNutritionPlan(
  store: Store,
  patientId: string,
  actor: AuditContext,
  input: NutritionPlanInput,
): Promise<NutritionPlan> {
  await assertAccess(store, actor, patientId);
  const draft = buildNutritionPlan(input);
  const now = new Date().toISOString();
  const id = newId("NUT");
  const hash = `0x${contentHash({ patientId, ...input, meals: draft.meals.map((meal) => meal.id) })}`;

  const plan: NutritionPlan = {
    id,
    patientId,
    phase: draft.phase,
    title: draft.title,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.actorId,
    reviewedByProfessional: actor.actorRole === "doctor",
    calorieTargetKcal: draft.calorieTargetKcal,
    proteinTargetGrams: draft.proteinTargetGrams,
    hydrationTargetMl: draft.hydrationTargetMl,
    goals: [...draft.goals, ...draft.cautions],
    meals: draft.meals,
    foodsToEmphasize: draft.foodsToEmphasize,
    foodsToDiscussWithClinician: draft.foodsToDiscussWithClinician,
    foodsThatMayWorsenSymptoms: draft.foodsThatMayWorsenSymptoms,
    sideEffectSupport: draft.sideEffectSupport.map((guidance) => ({
      id: guidance.id,
      symptom: guidance.symptom,
      summary: guidance.summary,
      suggestions: guidance.suggestions,
      whenToContactCareTeam: guidance.whenToContactCareTeam,
    })),
    cautions: draft.cautions,
    disclaimer: draft.disclaimer,
    contentHash: hash,
  };

  const created = await store.nutritionPlans.insert(plan);

  await createRecord(store, patientId, actor, {
    kind: "nutrition",
    title: `Nutrition plan created: ${draft.phase.replace(/-/g, " ")}`,
    summary: `${draft.meals.length} meal suggestions and ${draft.goals.length} goals. Educational — review with your clinical team.`,
    body: [
      `Phase: ${draft.phase}`,
      `Hydration target: ${draft.hydrationTargetMl} ml/day`,
      "",
      "Goals:",
      ...draft.goals.map((goal) => `- ${goal}`),
      "",
      "Meal suggestions:",
      ...draft.meals.map((meal) => `- ${meal.slot}: ${meal.name} (~${meal.approximateKcal} kcal, ${meal.proteinGrams} g protein) — ${meal.rationale}`),
      "",
      "Cautions:",
      ...draft.cautions.map((caution) => `- ${caution}`),
      "",
      draft.disclaimer,
    ].join("\n"),
  });

  await notify(store, {
    userId: patientId,
    kind: "nutrition-plan-update",
    title: "Your nutrition plan has been updated",
    body: `A ${draft.phase.replace(/-/g, " ")} plan with ${draft.meals.length} meal suggestions is available.`,
    actionLabel: "Open nutrition",
    actionHref: "/patient/nutrition",
    severity: "info",
  });

  await audit(store, actor, "NUTRITION_PLAN_CREATED", { patientId, resource: "nutrition-plan", resourceId: id, dataHash: hash });
  return created;
}

export async function listNutritionPlans(store: Store, patientId: string, actor: AuditContext): Promise<NutritionPlan[]> {
  await assertAccess(store, actor, patientId);
  return store.nutritionPlans.list({ where: { patientId }, orderBy: "createdAt", order: "desc" });
}

export async function logNutritionEntry(
  store: Store,
  patientId: string,
  actor: AuditContext,
  input: Omit<NutritionLogEntry, "id" | "patientId" | "loggedAt">,
): Promise<NutritionLogEntry> {
  if (actor.actorId !== patientId) throw forbidden("Only the patient can log their own nutrition entries");
  return store.nutritionLogs.insert({
    ...input,
    id: newId("NLOG"),
    patientId,
    loggedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
}

export async function nutritionAdherence(store: Store, patientId: string, days = 30): Promise<{
  entries: NutritionLogEntry[];
  adherenceRate: number;
  averageAppetite: number;
  averageNausea: number;
}> {
  const cutoff = Date.now() - days * 86_400_000;
  const all = await store.nutritionLogs.list({ where: { patientId } });
  const entries = all.filter((entry) => new Date(entry.loggedAt).getTime() >= cutoff);
  const followed = entries.filter((entry) => entry.adherence === "followed").length;
  const partial = entries.filter((entry) => entry.adherence === "partial").length;

  return {
    entries: entries.sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1)),
    adherenceRate: entries.length === 0 ? 0 : Number(((followed + partial * 0.5) / entries.length).toFixed(3)),
    averageAppetite: entries.length ? Number((entries.reduce((sum, e) => sum + e.appetiteScore, 0) / entries.length).toFixed(2)) : 0,
    averageNausea: entries.length ? Number((entries.reduce((sum, e) => sum + e.nauseaScore, 0) / entries.length).toFixed(2)) : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Treatments                                                          */
/* ------------------------------------------------------------------ */

const ON_CHAIN_STATUS: Record<TreatmentStatus, number> = {
  proposed: 0,
  authorized: 1,
  active: 2,
  "on-hold": 3,
  completed: 4,
  cancelled: 5,
};

export async function createTreatmentPlan(
  store: Store,
  patientId: string,
  actor: AuditContext & { role: string },
  input: {
    name: string;
    modality: TreatmentPlanRecord["modality"];
    status?: TreatmentStatus;
    startDate?: string | null;
    expectedEndDate?: string | null;
    summary: string;
    notes?: string;
    sideEffects?: string[];
    progressPercent?: number;
  },
): Promise<TreatmentPlanRecord> {
  // A clinician may only create a plan for a patient who has granted them consent.
  await assertAccess(store, { id: actor.actorId, role: actor.role as "doctor" }, patientId);
  const patient = await store.patients.get(patientId);
  if (!patient) throw notFound("Patient not found");

  const now = new Date().toISOString();
  const id = newId("TRT");
  const hash = `0x${contentHash({ patientId: patient.pseudonymousId, ...input })}`;

  const plan: TreatmentPlanRecord = {
    id,
    patientId,
    name: input.name,
    modality: input.modality,
    status: input.status ?? "proposed",
    startDate: input.startDate ?? null,
    expectedEndDate: input.expectedEndDate ?? null,
    treatingDoctorId: actor.actorId,
    summary: input.summary,
    notes: input.notes ?? "",
    sideEffects: input.sideEffects ?? [],
    progressPercent: input.progressPercent ?? 0,
    documents: [],
    appointments: [],
    contentHash: hash,
    onChainPlanId: null,
    authorizedByDoctorId: null,
    authorizedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const created = await store.treatments.insert(plan);

  const anchor = await chain.anchorTreatmentPlan(
    patient.pseudonymousId,
    bytes32(id),
    bytes32(input.modality),
    hash,
    (await store.users.get(actor.actorId))?.walletAddress ?? null,
  );

  await store.blockchainRecords.insert({
    id: newId("BCH"),
    patientId,
    kind: "treatment-plan",
    label: `Treatment plan: ${input.name}`,
    dataHash: hash,
    contract: "TreatmentRegistry",
    transactionHash: anchor.transactionHash,
    blockNumber: anchor.blockNumber,
    status: anchor.anchored ? "confirmed" : "unanchored",
    verification: "unverified",
    createdAt: now,
    confirmedAt: anchor.anchored ? now : null,
  });

  await store.treatments.update(id, { onChainPlanId: anchor.anchored ? bytes32(id) : null });

  await notify(store, {
    userId: patientId,
    kind: "doctor-message",
    title: "A treatment plan has been added to your record",
    body: `${input.name} (${input.modality.replace(/-/g, " ")}). Review it and discuss any questions with your care team.`,
    actionLabel: "View treatment",
    actionHref: "/patient/treatments",
    severity: "info",
  });

  await audit(store, actor, "TREATMENT_CREATED", { patientId, resource: "treatment", resourceId: id, dataHash: hash });
  return { ...created, onChainPlanId: anchor.anchored ? bytes32(id) : null };
}

export async function updateTreatmentStatus(
  store: Store,
  treatmentId: string,
  actor: AuditContext & { role: string },
  status: TreatmentStatus,
  note = "",
): Promise<TreatmentPlanRecord> {
  const plan = await store.treatments.get(treatmentId);
  if (!plan) throw notFound("Treatment not found");
  await assertAccess(store, { id: actor.actorId, role: actor.role as "doctor" }, plan.patientId);

  const updated = await store.treatments.update(treatmentId, { status, progressPercent: status === "completed" ? 100 : plan.progressPercent });
  await chain.updateTreatmentStatusOnChain(plan.onChainPlanId ?? bytes32(treatmentId), ON_CHAIN_STATUS[status], note ? bytes32(note) : bytes32(""));

  await audit(store, actor, "TREATMENT_STATUS_UPDATED", {
    patientId: plan.patientId,
    resource: "treatment",
    resourceId: treatmentId,
    dataHash: updated.contentHash,
  });
  await notify(store, {
    userId: plan.patientId,
    kind: "doctor-message",
    title: "Your treatment status changed",
    body: `${plan.name} is now ${status.replace("-", " ")}.`,
    severity: "info",
  });
  return updated;
}

export async function listTreatments(store: Store, patientId: string, actor: AuditContext): Promise<TreatmentPlanRecord[]> {
  await assertAccess(store, actor, patientId);
  return store.treatments.list({ where: { patientId }, orderBy: "createdAt", order: "desc" });
}

export async function getTreatment(store: Store, treatmentId: string, actor: AuditContext) {
  const plan = await store.treatments.get(treatmentId);
  if (!plan) throw notFound("Treatment not found");
  await assertAccess(store, actor, plan.patientId);
  const onChain = plan.onChainPlanId ? await chain.readTreatmentPlan(plan.onChainPlanId) : null;
  return { plan, onChain };
}

/* ------------------------------------------------------------------ */
/* Medications                                                         */
/* ------------------------------------------------------------------ */

export function buildDoseSchedule(medication: Omit<Medication, "doses">, days = 7): Medication["doses"] {
  const doses: Medication["doses"] = [];
  const start = new Date(medication.startDate);
  const end = medication.endDate ? new Date(medication.endDate) : new Date(Date.now() + days * 86_400_000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let day = 0; day < days; day++) {
    const date = new Date(today.getTime() + day * 86_400_000);
    if (date < start || date > end) continue;
    for (const time of medication.scheduledTimes) {
      const [hours, minutes] = time.split(":").map(Number);
      const scheduledAt = new Date(date);
      scheduledAt.setHours(hours ?? 8, minutes ?? 0, 0, 0);
      doses.push({
        id: `${medication.id}-${day}-${time}`,
        medicationId: medication.id,
        scheduledAt: scheduledAt.toISOString(),
        status: "pending",
        recordedAt: null,
        note: null,
      });
    }
  }
  return doses;
}

export async function createMedication(
  store: Store,
  patientId: string,
  actor: AuditContext & { role: string },
  input: Omit<Medication, "id" | "patientId" | "doses" | "createdAt" | "updatedAt" | "prescriberId">,
): Promise<Medication> {
  await assertAccess(store, { id: actor.actorId, role: actor.role as "doctor" }, patientId);
  const now = new Date().toISOString();
  const id = newId("MED");
  const base = { ...input, id, patientId, prescriberId: actor.actorId, createdAt: now, updatedAt: now };
  const medication = await store.medications.insert({ ...base, doses: buildDoseSchedule(base) });

  await createRecord(store, patientId, actor, {
    kind: "medication",
    title: `Medication added: ${input.name}`,
    summary: `${input.dosage} ${input.route}, ${input.frequency}. Prescribed by your care team.`,
    body: [
      `Name: ${input.name}`,
      `Active ingredient: ${input.activeIngredient}`,
      `Dosage: ${input.dosage}`,
      `Route: ${input.route}`,
      `Frequency: ${input.frequency}`,
      `Scheduled times: ${input.scheduledTimes.join(", ") || "not specified"}`,
      `Start: ${input.startDate}`,
      input.endDate ? `End: ${input.endDate}` : "End: ongoing",
      `Instructions: ${input.instructions || "as directed"}`,
      `Cautions: ${input.cautions || "none recorded"}`,
      "",
      "Never change your dose, skip a prescribed medicine or stop treatment without speaking to your care team.",
    ].join("\n"),
  });

  await notify(store, {
    userId: patientId,
    kind: "medication-reminder",
    title: "A new medication has been added",
    body: `${input.name} ${input.dosage} — ${input.frequency}.`,
    actionLabel: "View medications",
    actionHref: "/patient/medications",
    severity: "info",
  });

  await audit(store, actor, "MEDICATION_PRESCRIBED", { patientId, resource: "medication", resourceId: id });
  return medication;
}

/**
 * Record a dose as taken, missed or skipped.
 *
 * The patient may record what happened; they cannot change the prescribed dose, frequency
 * or schedule. Those fields are only writable by the prescriber.
 */
export async function recordDose(
  store: Store,
  patientId: string,
  actor: AuditContext,
  input: { medicationId: string; doseId: string; status: "taken" | "missed" | "skipped"; note?: string | null },
): Promise<Medication> {
  if (actor.actorId !== patientId) throw forbidden("Only the patient can record their own doses");
  const medication = await store.medications.get(input.medicationId);
  if (!medication) throw notFound("Medication not found");
  if (medication.patientId !== patientId) throw notFound("Medication not found");

  const dose = medication.doses.find((item) => item.id === input.doseId);
  if (!dose) throw notFound("Scheduled dose not found");

  const doses = medication.doses.map((item) =>
    item.id === input.doseId
      ? { ...item, status: input.status, recordedAt: new Date().toISOString(), note: input.note ?? null }
      : item,
  );

  const updated = await store.medications.update(input.medicationId, { doses });
  await audit(store, actor, "DOSE_RECORDED", { patientId, resource: "medication", resourceId: input.medicationId });

  if (input.status === "missed") {
    await notify(store, {
      userId: patientId,
      kind: "medication-reminder",
      title: "A dose was marked as missed",
      body: `Contact your care team for instructions about the missed ${medication.name} dose. Do not double up unless you have been told to.`,
      severity: "warning",
    });
  }
  return updated;
}

export async function listMedications(store: Store, patientId: string, actor: AuditContext): Promise<Medication[]> {
  await assertAccess(store, actor, patientId);
  return store.medications.list({ where: { patientId }, orderBy: "createdAt", order: "desc" });
}

export function upcomingDoses(medications: Medication[], hours = 24) {
  const horizon = Date.now() + hours * 3_600_000;
  return medications
    .filter((medication) => medication.status === "active" && medication.reminderEnabled)
    .flatMap((medication) =>
      medication.doses
        .filter((dose) => dose.status === "pending")
        .filter((dose) => {
          const time = new Date(dose.scheduledAt).getTime();
          return time >= Date.now() - 3_600_000 && time <= horizon;
        })
        .map((dose) => ({ medication, dose })),
    )
    .sort((a, b) => (a.dose.scheduledAt < b.dose.scheduledAt ? -1 : 1));
}

/* ------------------------------------------------------------------ */
/* Appointments                                                        */
/* ------------------------------------------------------------------ */

export async function requestAppointment(
  store: Store,
  patientId: string,
  actor: AuditContext,
  input: {
    doctorId: string;
    startsAt: string;
    endsAt: string;
    reason: string;
    modality?: Appointment["modality"];
    location?: string;
    notes?: string;
  },
): Promise<Appointment> {
  if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) {
    throw badRequest("The appointment must end after it starts");
  }
  const doctor = await store.doctors.get(input.doctorId);
  if (!doctor) throw notFound("Doctor not found");

  const clash = await store.appointments.findFirst((appointment) => {
    if (appointment.doctorId !== input.doctorId) return false;
    if (appointment.status === "cancelled" || appointment.status === "no-show") return false;
    return new Date(appointment.startsAt) < new Date(input.endsAt) && new Date(appointment.endsAt) > new Date(input.startsAt);
  });
  if (clash) throw badRequest("That time is no longer available. Please choose another slot.");

  const now = new Date().toISOString();
  const appointment = await store.appointments.insert({
    id: newId("APT"),
    patientId,
    doctorId: input.doctorId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    reason: input.reason,
    modality: input.modality ?? "in-person",
    status: "requested",
    location: input.location ?? "",
    notes: input.notes ?? "",
    reminderSent: false,
    createdAt: now,
    updatedAt: now,
  });

  await notify(store, {
    userId: input.doctorId,
    kind: "appointment-upcoming",
    title: "New appointment request",
    body: `${new Date(input.startsAt).toUTCString()} — ${input.reason}`,
    actionLabel: "Review requests",
    actionHref: "/doctor/appointments",
    severity: "info",
  });
  await audit(store, actor, "APPOINTMENT_REQUESTED", { patientId, resource: "appointment", resourceId: appointment.id });
  return appointment;
}

export async function setAppointmentStatus(
  store: Store,
  appointmentId: string,
  actor: AuditContext & { role: string },
  status: Appointment["status"],
): Promise<Appointment> {
  const appointment = await store.appointments.get(appointmentId);
  if (!appointment) throw notFound("Appointment not found");

  const isPatient = actor.actorId === appointment.patientId;
  const isDoctor = actor.actorId === appointment.doctorId;
  if (!isPatient && !isDoctor && actor.role !== "admin") throw forbidden("You cannot change this appointment");
  // Patients may withdraw an appointment. Confirming, completing or marking a no-show are
  // clinician actions — a patient cannot self-certify an appointment as attended.
  if (isPatient && status !== "cancelled") {
    throw forbidden("Patients may cancel an appointment; confirming, completing or marking a no-show is a clinician action");
  }

  const updated = await store.appointments.update(appointmentId, { status });
  await audit(store, actor, `APPOINTMENT_${status.toUpperCase()}`, {
    patientId: appointment.patientId,
    resource: "appointment",
    resourceId: appointmentId,
  });

  const otherParty = isPatient ? appointment.doctorId : appointment.patientId;
  await notify(store, {
    userId: otherParty,
    kind: "appointment-upcoming",
    title: `Appointment ${status}`,
    body: `${new Date(appointment.startsAt).toUTCString()} — ${appointment.reason}`,
    severity: status === "cancelled" ? "warning" : "info",
  });
  return updated;
}

export async function listAppointments(store: Store, filter: { patientId?: string; doctorId?: string }, actor: AuditContext) {
  if (filter.patientId) await assertAccess(store, actor, filter.patientId);
  if (!filter.patientId && !filter.doctorId) throw badRequest("Provide patientId or doctorId");
  const all = await store.appointments.list({ where: filter, orderBy: "startsAt", order: "asc" });
  return {
    upcoming: all.filter((appointment) => new Date(appointment.startsAt) >= new Date() && appointment.status !== "cancelled"),
    past: all.filter((appointment) => new Date(appointment.startsAt) < new Date() || appointment.status === "cancelled"),
  };
}

/**
 * Availability is derived from a clinician's working pattern minus their existing
 * appointments. Slots are 30 minutes, weekdays 09:00–17:00 local time.
 */
export async function doctorAvailability(store: Store, doctorId: string, days = 7): Promise<DoctorAvailabilitySlot[]> {
  const appointments = await store.appointments.list({ where: { doctorId } });
  const slots: DoctorAvailabilitySlot[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let day = 1; day <= days; day++) {
    const date = new Date(today.getTime() + day * 86_400_000);
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) continue;

    for (let hour = 9; hour < 17; hour++) {
      for (const minute of [0, 30]) {
        const startsAt = new Date(date);
        startsAt.setHours(hour, minute, 0, 0);
        const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
        const taken = appointments.some(
          (appointment) =>
            appointment.status !== "cancelled" &&
            new Date(appointment.startsAt) < endsAt &&
            new Date(appointment.endsAt) > startsAt,
        );
        slots.push({ doctorId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), available: !taken });
      }
    }
  }
  return slots;
}
