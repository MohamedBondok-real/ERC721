import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { auth, createTestContext, type TestContext } from "./helpers";

const iso = (offsetDays: number, hour = 10) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

describe("treatments, medications and appointments", () => {
  let ctx: TestContext;
  let medicationId = "";
  let doseId = "";

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  /* ---------------- treatments ---------------- */

  it("lets a consenting clinician create a treatment plan for their patient", async () => {
    const response = await request(ctx.app)
      .post(`/api/treatments?patientId=${ctx.patientId}`)
      .set(auth(ctx.doctorToken))
      .send({
        name: "Adjuvant chemotherapy — dose-dense AC",
        modality: "chemotherapy",
        startDate: iso(-14),
        expectedEndDate: iso(70),
        summary: "Four cycles of doxorubicin/cyclophosphamide as planned by the MDT.",
        sideEffects: ["fatigue", "nausea", "neutropenia"],
      });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe("proposed");
    expect(response.body.contentHash).toMatch(/^0x[0-9a-f]{64}$/);

    const listed = await request(ctx.app).get(`/api/treatments?patientId=${ctx.patientId}`).set(auth(ctx.patientToken));
    expect(listed.status).toBe(200);
    expect(listed.body.treatments.some((plan: { id: string }) => plan.id === response.body.id)).toBe(true);
  });

  it("refuses a treatment plan from a clinician without consent", async () => {
    const response = await request(ctx.app)
      .post(`/api/treatments?patientId=${ctx.patientId}`)
      .set(auth(ctx.otherDoctorToken))
      .send({ name: "Not authorised", modality: "radiation", summary: "Should never be created." });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("CONSENT_REQUIRED");
  });

  it("never lets a patient create or change a treatment plan", async () => {
    const create = await request(ctx.app)
      .post(`/api/treatments?patientId=${ctx.patientId}`)
      .set(auth(ctx.patientToken))
      .send({ name: "Self prescribed", modality: "other", summary: "Patient attempt" });
    expect(create.status).toBe(403);

    const treatments = await request(ctx.app).get(`/api/treatments?patientId=${ctx.patientId}`).set(auth(ctx.doctorToken));
    const plan = treatments.body.treatments[0];
    const change = await request(ctx.app).patch(`/api/treatments/${plan.id}/status`).set(auth(ctx.patientToken)).send({ status: "active" });
    expect(change.status).toBe(403);
  });

  it("follows the treatment status lifecycle", async () => {
    const created = await request(ctx.app)
      .post(`/api/treatments?patientId=${ctx.patientId}`)
      .set(auth(ctx.doctorToken))
      .send({ name: "Radiotherapy — chest wall", modality: "radiation", summary: "Twenty fractions following surgery.", startDate: iso(7) });
    expect(created.status).toBe(201);

    const active = await request(ctx.app).patch(`/api/treatments/${created.body.id}/status`).set(auth(ctx.doctorToken)).send({ status: "active", note: "Commenced" });
    expect(active.status).toBe(200);
    expect(active.body.status).toBe("active");

    const completed = await request(ctx.app).patch(`/api/treatments/${created.body.id}/status`).set(auth(ctx.doctorToken)).send({ status: "completed", note: "Finished" });
    expect(completed.status).toBe(200);
  });

  /* ---------------- medications ---------------- */

  it("lets a clinician prescribe a medication with a generated dose schedule", async () => {
    const response = await request(ctx.app)
      .post(`/api/medications?patientId=${ctx.patientId}`)
      .set(auth(ctx.doctorToken))
      .send({
        name: "Tamoxifen 20 mg",
        activeIngredient: "tamoxifen citrate",
        dosage: "20 mg",
        route: "oral",
        frequency: "once daily",
        scheduledTimes: ["08:00"],
        startDate: iso(-3).slice(0, 10),
        instructions: "Take at the same time each day with water.",
        cautions: "Report unusual vaginal bleeding or calf pain promptly.",
      });
    expect(response.status).toBe(201);
    expect(response.body.doses.length).toBeGreaterThan(0);
    expect(response.body.prescriberId).toBe(ctx.doctorId);
    medicationId = response.body.id;
    doseId = response.body.doses.find((dose: { status: string }) => dose.status === "pending")?.id ?? response.body.doses[0]!.id;

    // The prescription also lands in the medical record with an explicit "never self-adjust" line.
    const records = await request(ctx.app).get("/api/patients/records").set(auth(ctx.patientToken));
    const prescription = records.body.records.find((record: { id: string }) => record.title === `Medication added: Tamoxifen 20 mg`);
    expect(prescription).toBeTruthy();
    expect(prescription.body).toMatch(/Never change your dose/);
  });

  it("refuses a patient trying to prescribe or edit medication", async () => {
    const prescribe = await request(ctx.app)
      .post(`/api/medications?patientId=${ctx.patientId}`)
      .set(auth(ctx.patientToken))
      .send({ name: "Self prescribed", activeIngredient: "unknown", dosage: "1 mg", route: "oral", frequency: "daily", startDate: iso(-1).slice(0, 10) });
    expect(prescribe.status).toBe(403);

    const edit = await request(ctx.app).patch(`/api/medications/${medicationId}`).set(auth(ctx.patientToken)).send({ dosage: "100 mg" });
    expect(edit.status).toBe(403);
  });

  it("lets the patient record a dose but never change the dosage", async () => {
    const recorded = await request(ctx.app)
      .post("/api/medications/dose")
      .set(auth(ctx.patientToken))
      .send({ medicationId, doseId, status: "taken", note: "Took after breakfast" });
    expect(recorded.status).toBe(200);
    const dose = recorded.body.doses.find((item: { id: string }) => item.id === doseId);
    expect(dose.status).toBe("taken");
    expect(dose.recordedAt).toBeTruthy();
    expect(recorded.body.dosage).toBe("20 mg");
  });

  it("raises a care-team notification when a dose is marked as missed", async () => {
    const pending = await request(ctx.app).get(`/api/medications?patientId=${ctx.patientId}`).set(auth(ctx.patientToken));
    const other = pending.body.medications
      .find((medication: { id: string }) => medication.id === medicationId)
      .doses.find((dose: { status: string }) => dose.status === "pending");

    const response = await request(ctx.app)
      .post("/api/medications/dose")
      .set(auth(ctx.patientToken))
      .send({ medicationId, doseId: other.id, status: "missed" });
    expect(response.status).toBe(200);

    const notifications = await request(ctx.app).get("/api/notifications").set(auth(ctx.patientToken));
    expect(notifications.body.notifications.some((note: { title: string }) => /missed/i.test(note.title))).toBe(true);
  });

  it("refuses a clinician trying to record doses on the patient's behalf", async () => {
    const response = await request(ctx.app)
      .post("/api/medications/dose")
      .set(auth(ctx.doctorToken))
      .send({ medicationId, doseId, status: "taken" });
    expect(response.status).toBe(403);
  });

  it("does not expose another patient's medication", async () => {
    const response = await request(ctx.app)
      .post("/api/medications/dose")
      .set(auth(ctx.patientToken))
      .send({ medicationId: "MED-does-not-exist", doseId, status: "taken" });
    expect(response.status).toBe(404);
  });

  /* ---------------- appointments ---------------- */

  it("books an appointment in an available slot", async () => {
    const availability = await request(ctx.app).get(`/api/availability?doctorId=${ctx.doctorId}&days=14`).set(auth(ctx.patientToken));
    expect(availability.status).toBe(200);
    const free = availability.body.slots.find((slot: { available: boolean }) => slot.available);
    expect(free).toBeTruthy();

    const response = await request(ctx.app)
      .post("/api/appointments")
      .set(auth(ctx.patientToken))
      .send({ doctorId: ctx.doctorId, startsAt: free.startsAt, endsAt: free.endsAt, reason: "Post-treatment review", modality: "in-person" });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe("requested");
  });

  it("rejects a double booking of the same slot", async () => {
    const availability = await request(ctx.app).get(`/api/availability?doctorId=${ctx.doctorId}&days=14`).set(auth(ctx.patientToken));
    const free = availability.body.slots.find((slot: { available: boolean }) => slot.available);

    const first = await request(ctx.app)
      .post("/api/appointments")
      .set(auth(ctx.patientToken))
      .send({ doctorId: ctx.doctorId, startsAt: free.startsAt, endsAt: free.endsAt, reason: "First booking" });
    expect(first.status).toBe(201);

    const second = await request(ctx.app)
      .post("/api/appointments")
      .set(auth(ctx.patientToken))
      .send({ doctorId: ctx.doctorId, startsAt: free.startsAt, endsAt: free.endsAt, reason: "Conflicting booking" });
    expect(second.status).toBe(400);
    expect(second.body.error.message).toMatch(/no longer available/i);
  });

  it("rejects an appointment that ends before it starts", async () => {
    const start = iso(3, 11);
    const response = await request(ctx.app)
      .post("/api/appointments")
      .set(auth(ctx.patientToken))
      .send({ doctorId: ctx.doctorId, startsAt: start, endsAt: iso(3, 10), reason: "Invalid window" });
    expect(response.status).toBe(400);
  });

  it("lets a patient cancel but not confirm or complete an appointment", async () => {
    const availability = await request(ctx.app).get(`/api/availability?doctorId=${ctx.doctorId}&days=21`).set(auth(ctx.patientToken));
    const free = availability.body.slots.find((slot: { available: boolean }) => slot.available);
    const created = await request(ctx.app)
      .post("/api/appointments")
      .set(auth(ctx.patientToken))
      .send({ doctorId: ctx.doctorId, startsAt: free.startsAt, endsAt: free.endsAt, reason: "Status transition test" });

    const confirm = await request(ctx.app)
      .patch(`/api/appointments/${created.body.id}/status`)
      .set(auth(ctx.patientToken))
      .send({ status: "confirmed" });
    expect(confirm.status).toBe(403);
    expect(confirm.body.error.message).toMatch(/clinician action/i);

    const cancelled = await request(ctx.app)
      .patch(`/api/appointments/${created.body.id}/status`)
      .set(auth(ctx.patientToken))
      .send({ status: "cancelled" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");
  });

  it("splits a patient's appointments into upcoming and past", async () => {
    const response = await request(ctx.app).get("/api/appointments").set(auth(ctx.patientToken));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.upcoming)).toBe(true);
    expect(Array.isArray(response.body.past)).toBe(true);
    expect(response.body.upcoming.length + response.body.past.length).toBeGreaterThan(0);
  });
});
