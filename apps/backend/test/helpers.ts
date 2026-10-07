import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app";
import { setStore } from "../src/db";
import { createMemoryStore } from "../src/db/memoryStore";
import { seedDemoData } from "../src/seed/demoData";
import { DEMO_PASSWORD } from "../src/seed/demoCredentials";

export interface TestContext {
  app: Express;
  patientToken: string;
  patientId: string;
  doctorToken: string;
  doctorId: string;
  adminToken: string;
  adminId: string;
  otherDoctorToken: string;
  otherDoctorId: string;
}

/** Fresh app + in-memory store seeded with the fictional demo cohort. */
export async function createTestContext(): Promise<TestContext> {
  setStore(createMemoryStore());
  const app = createApp();
  await seedDemoData({ ...(await import("../src/db")).getStore() } as never);

  const store = (await import("../src/db")).getStore();
  const login = async (email: string) => {
    const response = await request(app).post("/api/auth/login").send({ email, password: DEMO_PASSWORD });
    expect(response.status, `login failed for ${email}: ${JSON.stringify(response.body)}`).toBe(200);
    return response.body as { token: string; patientId: string | null; doctorId: string | null; user: { id: string } };
  };

  const patient = await login("amina@demo.breastcare.ai");
  const doctor = await login("doctor@demo.breastcare.ai");
  const admin = await login("admin@demo.breastcare.ai");
  const otherDoctor = await login("oncologist@demo.breastcare.ai");

  const patientRecord = await store.patients.get(patient.patientId!);
  void patientRecord;

  return {
    app,
    patientToken: patient.token,
    patientId: patient.patientId!,
    doctorToken: doctor.token,
    doctorId: doctor.doctorId!,
    adminToken: admin.token,
    adminId: admin.user.id,
    otherDoctorToken: otherDoctor.token,
    otherDoctorId: otherDoctor.doctorId!,
  };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("test harness", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    ctx = await createTestContext();
  });

  it("seeds the fictional demo cohort and authenticates each role", () => {
    expect(ctx.patientId).toBeTruthy();
    expect(ctx.doctorId).toBeTruthy();
    expect(ctx.adminId).toBeTruthy();
  });

  it("reports health", async () => {
    const response = await request(ctx.app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });
});
