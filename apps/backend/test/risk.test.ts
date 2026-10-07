import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { auth, createTestContext, type TestContext } from "./helpers";
import { makesAffirmativeClaim } from "./safetyCopy";

describe("risk assessment & symptoms", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });

  const questionnaire = {
    age: 52,
    familyHistory: {
      firstDegreeRelativesWithBreastCancer: 1,
      maleRelativeWithBreastCancer: false,
      relativeDiagnosedBefore50: true,
      ovarianOrPancreaticCancerInFamily: false,
      knownPathogenicVariant: false,
      ashkenaziJewishAncestry: false,
    },
    personalHistory: {
      previousBreastCancer: false,
      previousBenignBreastDisease: false,
      atypicalHyperplasiaOrLcis: false,
      chestRadiationBeforeAge30: false,
      otherCancerHistory: false,
    },
    reproductiveHistory: {
      menarcheBefore12: true,
      menopauseAfter55: false,
      firstLiveBirthAfter30: true,
      neverGaveBirth: false,
      neverBreastfed: true,
      combinedHormoneTherapy: false,
      currentHormoneTherapy: false,
    },
    lifestyle: { bmi: 27, alcoholUnitsPerWeek: 9, physicalActivity: "low", smokingStatus: "former", postmenopausal: true },
    screening: { lastMammogramMonthsAgo: 30, denseBreastTissue: true, screeningUpToDate: false },
    symptoms: [],
  };

  it("publishes the available models and labels them as educational", async () => {
    const response = await request(ctx.app).get("/api/patients/risk-assessment/models").set(auth(ctx.patientToken));
    expect(response.status).toBe(200);
    const active = response.body.models.find((model: { active: boolean }) => model.active);
    expect(active.label).toMatch(/educational/i);
    expect(active.description).toMatch(/not a diagnostic tool|not calibrated/i);
  });

  it("returns a risk indicator with factors, guidance and disclaimers", async () => {
    const response = await request(ctx.app).post("/api/patients/risk-assessment").set(auth(ctx.patientToken)).send(questionnaire);
    expect(response.status).toBe(201);
    expect(["low", "moderate", "high"]).toContain(response.body.level);
    expect(response.body.factors.length).toBeGreaterThan(3);
    expect(response.body.guidance.join(" ")).toMatch(/professional|clinician/i);
    expect(response.body.modelId).toBe("rule-based-educational");

    expect(response.body.disclaimer).toMatch(/not a diagnosis/i);
    expect(response.body.disclaimer).toMatch(/does not say whether you have breast cancer/i);

    // The payload may quote the disclaimer ("does not say whether you have breast cancer"),
    // so only affirmative sentences are checked for a diagnostic claim.
    const payload = JSON.stringify(response.body);
    expect(makesAffirmativeClaim(payload, /you have (breast )?cancer/i)).toBe(false);
    expect(makesAffirmativeClaim(payload, /you (are|were) diagnosed with/i)).toBe(false);
  });

  it("rejects an under-age questionnaire", async () => {
    const response = await request(ctx.app).post("/api/patients/risk-assessment").set(auth(ctx.patientToken)).send({ ...questionnaire, age: 12 });
    expect(response.status).toBe(422);
  });

  it("records the assessment in the medical timeline and the record list", async () => {
    await request(ctx.app).post("/api/patients/risk-assessment").set(auth(ctx.patientToken)).send(questionnaire);
    const timeline = await request(ctx.app).get("/api/patients/timeline").set(auth(ctx.patientToken));
    expect(timeline.status).toBe(200);
    expect(timeline.body.events.some((event: { kind: string }) => event.kind === "risk-assessment")).toBe(true);
    // Sorted newest first.
    const times = timeline.body.events.map((event: { occurredAt: string }) => new Date(event.occurredAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("accepts a symptom report and returns educational guidance", async () => {
    const response = await request(ctx.app)
      .post("/api/patients/symptoms")
      .set(auth(ctx.patientToken))
      .send({ code: "breast-lump", severity: "moderate", side: "left", durationWeeks: 3, progressive: true, notes: "New lump noticed while showering." });
    expect(response.status).toBe(201);
    expect(response.body.guidance).toMatch(/examined by a clinician|clinician/i);
    expect(response.body.redFlag).toBe(true);
    expect(response.body.guidance.toLowerCase()).not.toContain("you have cancer");
  });

  it("rejects an unknown symptom code", async () => {
    const response = await request(ctx.app)
      .post("/api/patients/symptoms")
      .set(auth(ctx.patientToken))
      .send({ code: "not-a-symptom", severity: "mild", side: "left", durationWeeks: 1, progressive: false });
    expect(response.status).toBe(404);
  });

  it("publishes the symptom catalogue", async () => {
    const response = await request(ctx.app).get("/api/patients/symptoms/catalogue").set(auth(ctx.patientToken));
    expect(response.status).toBe(200);
    expect(response.body.symptoms.length).toBeGreaterThanOrEqual(10);
    expect(response.body.symptoms[0]).toHaveProperty("description");
  });

  it("serves red-flag guidance with an emergency statement", async () => {
    const response = await request(ctx.app).get("/api/red-flags");
    expect(response.status).toBe(200);
    expect(response.body.emergency).toMatch(/emergency services/i);
    expect(response.body.categories.length).toBeGreaterThanOrEqual(5);
    expect(response.body.categories.every((category: { action: string }) => category.action.length > 20)).toBe(true);
  });
});
