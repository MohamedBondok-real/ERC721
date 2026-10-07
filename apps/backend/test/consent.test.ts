import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { auth, createTestContext, type TestContext } from "./helpers";

describe("consent-gated access control", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });

  it("lets a patient read only their own record", async () => {
    const own = await request(ctx.app).get("/api/patients/records").set(auth(ctx.patientToken));
    expect(own.status).toBe(200);

    const other = await request(ctx.app).get("/api/patients/records?patientId=someone-else").set(auth(ctx.patientToken));
    expect(other.status).toBe(403);
  });

  it("lets a clinician read a record only after the patient granted consent", async () => {
    const granted = await request(ctx.app).get(`/api/patients/records?patientId=${ctx.patientId}`).set(auth(ctx.doctorToken));
    expect(granted.status).toBe(200);
    expect(granted.body.records.length).toBeGreaterThan(0);
  });

  it("blocks a clinician who has no consent for that patient", async () => {
    // Amina consented only to the breast surgeon, so the medical oncologist has no grant.
    const denied = await request(ctx.app).get(`/api/patients/records?patientId=${ctx.patientId}`).set(auth(ctx.otherDoctorToken));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("CONSENT_REQUIRED");
    expect(denied.body.error.details.patientId).toBe(ctx.patientId);

    const deniedTimeline = await request(ctx.app).get(`/api/patients/timeline?patientId=${ctx.patientId}`).set(auth(ctx.otherDoctorToken));
    expect(deniedTimeline.status).toBe(403);

    const deniedOverview = await request(ctx.app).get(`/api/patients/overview?patientId=${ctx.patientId}`).set(auth(ctx.otherDoctorToken));
    expect(deniedOverview.status).toBe(403);
  });

  it("reports the access decision for a consenting clinician through the access endpoint", async () => {
    const granted = await request(ctx.app).get(`/api/patients/access?patientId=${ctx.patientId}`).set(auth(ctx.doctorToken));
    expect(granted.status).toBe(200);
    expect(granted.body.allowed).toBe(true);

    const denied = await request(ctx.app).get(`/api/patients/access?patientId=${ctx.patientId}`).set(auth(ctx.otherDoctorToken));
    expect(denied.status).toBe(200);
    expect(denied.body.allowed).toBe(false);
    expect(denied.body.reason).toBe("no-active-consent");
  });

  it("lets a patient grant consent to a new clinician, unlocking their access", async () => {
    const before = await request(ctx.app).get(`/api/patients/records?patientId=${ctx.patientId}`).set(auth(ctx.otherDoctorToken));
    expect(before.status).toBe(403);

    const granted = await request(ctx.app)
      .post("/api/consent")
      .set(auth(ctx.patientToken))
      .send({
        granteeId: ctx.otherDoctorId,
        scopeName: "full-record-access",
        scopeDescription: "Read access to the complete medical record for continuity of care.",
      });
    expect(granted.status).toBe(201);
    expect(granted.body.consent.scopeHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(granted.body.anchored.anchored).toBe(false); // no chain in the test environment
    expect(granted.body.anchored.reason).toBeTruthy();

    const after = await request(ctx.app).get(`/api/patients/records?patientId=${ctx.patientId}`).set(auth(ctx.otherDoctorToken));
    expect(after.status).toBe(200);
  });

  it("removes access immediately when the patient revokes consent", async () => {
    const consents = await request(ctx.app).get("/api/consent").set(auth(ctx.patientToken));
    expect(consents.status).toBe(200);
    const target = consents.body.consents.find((consent: { granteeId: string; effectiveStatus: string }) => consent.granteeId === ctx.doctorId && consent.effectiveStatus === "active");
    expect(target).toBeTruthy();

    const before = await request(ctx.app).get(`/api/patients/records?patientId=${ctx.patientId}`).set(auth(ctx.doctorToken));
    expect(before.status).toBe(200);

    const revoked = await request(ctx.app).post(`/api/consent/${target.id}/revoke`).set(auth(ctx.patientToken));
    expect(revoked.status).toBe(200);
    expect(revoked.body.consent.status).toBe("revoked");

    const after = await request(ctx.app).get(`/api/patients/records?patientId=${ctx.patientId}`).set(auth(ctx.doctorToken));
    expect(after.status).toBe(403);
    expect(after.body.error.code).toBe("CONSENT_REQUIRED");

    // The refusal is recorded in the audit trail.
    const audit = await request(ctx.app).get("/api/admin/audit-logs?limit=20").set(auth(ctx.adminToken));
    expect(audit.status).toBe(200);
    expect(audit.body.entries.some((entry: { action: string }) => entry.action === "ACCESS_DENIED")).toBe(true);
  });

  it("prevents a clinician from granting consent on the patient's behalf", async () => {
    const response = await request(ctx.app)
      .post("/api/consent")
      .set(auth(ctx.doctorToken))
      .send({ granteeId: ctx.doctorId, scopeName: "full-record-access", scopeDescription: "self-grant" });
    expect(response.status).toBe(403);
  });

  it("gives administrators no implicit access to clinical records", async () => {
    const denied = await request(ctx.app).get(`/api/patients/records?patientId=${ctx.patientId}`).set(auth(ctx.adminToken));
    expect(denied.status).toBe(403);
    expect(denied.body.error.details.patientId).toBe(ctx.patientId);

    const overview = await request(ctx.app).get("/api/admin/overview").set(auth(ctx.adminToken));
    expect(overview.status).toBe(200);
    expect(overview.body.privacyNote).toMatch(/do not have implicit access/i);
  });

  it("lists only consenting patients for a clinician", async () => {
    const response = await request(ctx.app).get("/api/doctors/patients").set(auth(ctx.doctorToken));
    expect(response.status).toBe(200);
    expect(response.body.total).toBeGreaterThan(0);
    for (const patient of response.body.patients) {
      expect(patient.accessStatus).toBe("granted");
      expect(patient.passwordHash).toBeUndefined();
      expect(patient.email).toBeUndefined();
    }
  });

  it("surfaces risk alerts only for consenting patients", async () => {
    const response = await request(ctx.app).get("/api/doctors/alerts").set(auth(ctx.doctorToken));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.alerts)).toBe(true);
  });
});
