import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { auth, createTestContext, type TestContext } from "./helpers";
import { makesAffirmativeClaim } from "./safetyCopy";

describe("nutrition planning", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });

  const build = (phase: string, sideEffects: string[] = []) => ({
    phase,
    treatmentModalities: ["chemotherapy"],
    sideEffects,
    dietaryPreferences: ["vegetarian"],
    allergies: ["shellfish"],
    restrictions: [],
    comorbidities: ["type 2 diabetes"],
    clinicianRecommendations: "",
    appetiteScore: 2,
    weightTrend: "losing",
  });

  it("builds a phase-specific plan for every supported phase", async () => {
    for (const phase of ["during-treatment", "recovery", "survivorship", "side-effect-support"]) {
      const response = await request(ctx.app)
        .post("/api/patients/nutrition/plans")
        .set(auth(ctx.patientToken))
        .send(build(phase, phase === "side-effect-support" ? ["nausea", "taste-changes"] : []));
      expect(response.status, phase).toBe(201);
      expect(response.body.phase).toBe(phase);
      expect(response.body.meals.length).toBeGreaterThanOrEqual(3);
      expect(response.body.hydrationTargetMl).toBeGreaterThan(1500);
      expect(response.body.calorieTargetKcal).toBeNull(); // never prescriptive calorie targets
      expect(response.body.proteinTargetGrams).toBeNull();
    }
  });

  it("always carries the educational disclaimer and avoids cure claims", async () => {
    const response = await request(ctx.app)
      .post("/api/patients/nutrition/plans")
      .set(auth(ctx.patientToken))
      .send(build("during-treatment", ["appetite-loss"]));
    expect(response.status).toBe(201);
    expect(response.body.disclaimer).toContain(
      "This plan is educational and should be reviewed by a qualified healthcare professional.",
    );
    expect(response.body.cautions.length).toBeGreaterThan(0);

    // "No diet cures cancer" is exactly the copy we want, so negated sentences are excluded.
    const payload = JSON.stringify(response.body);
    expect(makesAffirmativeClaim(payload, /cures? (breast )?cancer/i)).toBe(false);
    expect(makesAffirmativeClaim(payload, /eliminates cancer/i)).toBe(false);
    expect(makesAffirmativeClaim(payload, /detox(ify)? your body/i)).toBe(false);
    expect(makesAffirmativeClaim(payload, /replace your (treatment|chemotherapy)/i)).toBe(false);
  });

  it("matches side-effect support to the reported symptoms", async () => {
    const response = await request(ctx.app)
      .post("/api/patients/nutrition/plans")
      .set(auth(ctx.patientToken))
      .send(build("side-effect-support", ["nausea", "mouth-discomfort"]));
    expect(response.status).toBe(201);
    const symptoms = response.body.sideEffectSupport.map((item: { id: string }) => item.id);
    expect(symptoms).toContain("nausea");
    expect(symptoms).toContain("mouth-discomfort");
    for (const item of response.body.sideEffectSupport) {
      expect(item.whenToContactCareTeam.length).toBeGreaterThan(10);
    }
  });

  it("records the plan in the medical record with its disclaimer", async () => {
    const records = await request(ctx.app).get("/api/patients/records").set(auth(ctx.patientToken));
    const nutrition = records.body.records.find((record: { kind: string }) => record.kind === "nutrition");
    expect(nutrition).toBeTruthy();
    expect(nutrition.body).toMatch(/educational and should be reviewed by a qualified healthcare professional/);
  });

  it("lists seeded plans and adherence statistics for the signed-in patient", async () => {
    const response = await request(ctx.app).get("/api/patients/nutrition").set(auth(ctx.patientToken));
    expect(response.status).toBe(200);
    expect(response.body.plans.length).toBeGreaterThan(0);
    expect(response.body.adherence.adherenceRate).toBeGreaterThan(0);
    expect(response.body.adherence.entries.length).toBeGreaterThan(0);
  });

  it("accepts a nutrition log from the patient and updates adherence", async () => {
    const before = await request(ctx.app).get("/api/patients/nutrition/adherence?days=1").set(auth(ctx.patientToken));

    const logged = await request(ctx.app)
      .post("/api/patients/nutrition/logs")
      .set(auth(ctx.patientToken))
      .send({ slot: "breakfast", description: "Porridge with yoghurt", adherence: "followed", appetiteScore: 3, nauseaScore: 1 });
    expect(logged.status).toBe(201);
    expect(logged.body.loggedAt).toBeTruthy();

    const after = await request(ctx.app).get("/api/patients/nutrition/adherence?days=1").set(auth(ctx.patientToken));
    expect(after.body.entries.length).toBe(before.body.entries.length + 1);
  });

  it("refuses a clinician without consent, and lets one with consent read the plan", async () => {
    const denied = await request(ctx.app).get(`/api/patients/nutrition?patientId=${ctx.patientId}`).set(auth(ctx.otherDoctorToken));
    expect(denied.status).toBe(403);

    const granted = await request(ctx.app).get(`/api/patients/nutrition?patientId=${ctx.patientId}`).set(auth(ctx.doctorToken));
    expect(granted.status).toBe(200);
  });

  it("prevents a clinician from logging nutrition entries for a patient", async () => {
    const response = await request(ctx.app)
      .post(`/api/patients/nutrition/logs?patientId=${ctx.patientId}`)
      .set(auth(ctx.doctorToken))
      .send({ slot: "lunch", description: "Clinician attempt", adherence: "followed", appetiteScore: 3, nauseaScore: 0 });
    expect(response.status).toBe(403);
  });
});
