import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { auth, createTestContext, type TestContext } from "./helpers";

describe("authentication & authorisation", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });

  it("rejects requests without a token", async () => {
    const response = await request(ctx.app).get("/api/patients/overview");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects an invalid token", async () => {
    const response = await request(ctx.app).get("/api/patients/overview").set(auth("not-a-real-token"));
    expect(response.status).toBe(401);
  });

  it("rejects wrong passwords without revealing whether the account exists", async () => {
    const wrong = await request(ctx.app).post("/api/auth/login").send({ email: "amina@demo.breastcare.ai", password: "WrongPassword123" });
    const missing = await request(ctx.app).post("/api/auth/login").send({ email: "nobody@demo.breastcare.ai", password: "WrongPassword123" });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body.error.message).toBe(missing.body.error.message);
  });

  it("validates registration payloads", async () => {
    const response = await request(ctx.app).post("/api/auth/register").send({
      email: "not-an-email",
      password: "weak",
      confirmPassword: "different",
      displayName: "X",
      role: "patient",
      acceptedDisclaimer: false,
    });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details.length).toBeGreaterThan(1);
  });

  it("registers a new patient account end to end", async () => {
    const response = await request(ctx.app).post("/api/auth/register").send({
      email: "new.patient@example.com",
      password: "Str0ngPassword",
      confirmPassword: "Str0ngPassword",
      displayName: "New Patient",
      role: "patient",
      birthYear: 1980,
      acceptedDisclaimer: true,
    });
    expect(response.status).toBe(201);
    expect(response.body.token).toBeTruthy();
    expect(response.body.patientId).toBeTruthy();
    expect(response.body.user.passwordHash).toBeUndefined();

    const me = await request(ctx.app).get("/api/auth/me").set(auth(response.body.token));
    expect(me.status).toBe(200);
    expect(me.body.patient.pseudonymousId).toMatch(/^PT-/);
    expect(me.body.patient.passwordHash).toBeUndefined();
  });

  it("exposes platform metadata including the medical disclaimer", async () => {
    const response = await request(ctx.app).get("/api/auth/meta");
    expect(response.status).toBe(200);
    expect(response.body.disclaimer).toMatch(/does not provide a medical diagnosis/);
    expect(response.body.demoBanner).toMatch(/FICTIONAL DEMO DATA/);
  });
});
