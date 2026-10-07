import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { auth, createTestContext, type TestContext } from "./helpers";
import { getStore, setStore } from "../src/db";

describe("records, reports and integrity verification", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });

  it("creates a record with a content hash", async () => {
    const response = await request(ctx.app)
      .post("/api/patients/records")
      .set(auth(ctx.patientToken))
      .send({ kind: "medical-history", title: "Previous surgery", summary: "Appendicectomy in 2015", body: "Appendicectomy 2015, no complications." });
    expect(response.status).toBe(201);
    expect(response.body.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(response.body.body).toContain("Appendicectomy");
  });

  it("verifies an untouched record as intact", async () => {
    const created = await request(ctx.app)
      .post("/api/patients/records")
      .set(auth(ctx.patientToken))
      .send({ kind: "lab-result", title: "FBC", summary: "Full blood count", body: "Haemoglobin 12.8 g/dL, white cell count 4.1." });
    const verification = await request(ctx.app).post(`/api/patients/records/${created.body.id}/verify`).set(auth(ctx.patientToken));

    expect(verification.status).toBe(200);
    expect(verification.body.localMatches).toBe(true);
    expect(verification.body.localHash).toBe(verification.body.storedHash);
  });

  it("detects tampering after the fact", async () => {
    const created = await request(ctx.app)
      .post("/api/patients/records")
      .set(auth(ctx.patientToken))
      .send({ kind: "doctor-note", title: "Note", summary: "Original note", body: "Original clinical note text." });

    // Simulate an out-of-band edit that bypassed the API.
    const store = getStore();
    await store.records.update(created.body.id, { body: "Altered clinical note text." } as never);

    const verification = await request(ctx.app).post(`/api/patients/records/${created.body.id}/verify`).set(auth(ctx.patientToken));
    expect(verification.status).toBe(200);
    expect(verification.body.localMatches).toBe(false);
    expect(verification.body.localHash).not.toBe(verification.body.storedHash);
  });

  it("lets a consenting clinician create a report the patient can see and verify", async () => {
    const created = await request(ctx.app)
      .post(`/api/patients/reports?patientId=${ctx.patientId}`)
      .set(auth(ctx.doctorToken))
      .send({
        title: "Clinic review",
        date: new Date().toISOString(),
        clinicalNotes: "Reviewed in clinic today.",
        assessment: "Stable, no new concerns.",
        treatmentInformation: "Continue current plan.",
        recommendations: "Return in three months.",
        followUpDate: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      });
    expect(created.status).toBe(201);
    expect(created.body.contentHash).toMatch(/^0x[0-9a-f]{64}$/);

    const patientReports = await request(ctx.app).get("/api/patients/reports").set(auth(ctx.patientToken));
    expect(patientReports.status).toBe(200);
    expect(patientReports.body.reports.some((report: { id: string }) => report.id === created.body.id)).toBe(true);

    const verification = await request(ctx.app).post(`/api/patients/reports/${created.body.id}/verify`).set(auth(ctx.patientToken));
    expect(verification.status).toBe(200);
    expect(verification.body.localMatches).toBe(true);
  });

  it("refuses a report from a clinician without consent", async () => {
    const third = await request(ctx.app)
      .post("/api/auth/login")
      .send({ email: "radiotherapy@demo.breastcare.ai", password: "BreastCare#Demo2026" });
    expect(third.status).toBe(200);
    const response = await request(ctx.app)
      .post(`/api/patients/reports?patientId=${ctx.patientId}`)
      .set(auth(third.body.token))
      .send({
        title: "Report attempt",
        date: new Date().toISOString(),
        clinicalNotes: "Clinical notes",
        assessment: "Assessment",
        recommendations: "Recommendations",
      });
    expect(response.status).toBe(403);
  });

  it("builds a chronological timeline covering every record category", async () => {
    const response = await request(ctx.app).get("/api/patients/timeline").set(auth(ctx.patientToken));
    expect(response.status).toBe(200);
    const kinds = new Set(response.body.events.map((event: { kind: string }) => event.kind));
    for (const expected of ["report", "risk-assessment", "nutrition", "appointment", "consent"]) {
      expect(kinds.has(expected), `timeline missing ${expected}`).toBe(true);
    }
  });

  it("keeps the store switchable (memory driver in use for tests)", () => {
    expect(getStore()).toBeTruthy();
    setStore(getStore());
  });
});
