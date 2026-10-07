import { describe, expect, it } from "vitest";
import { bytes32From, canonicalJson, isAddress, isBytes32, sha256Hex, taggedHash } from "../src/crypto";
import { loginSchema, registerSchema, symptomReportSchema, treatmentPlanSchema } from "../src/schemas";

describe("canonical hashing", () => {
  it("is independent of key order", () => {
    expect(canonicalJson({ a: 1, b: { c: 2, d: [3, 4] } })).toBe(canonicalJson({ b: { d: [3, 4], c: 2 }, a: 1 }));
  });

  it("drops undefined values and preserves array order", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalJson([1, 2, 3])).toBe("[1,2,3]");
    expect(canonicalJson([3, 2, 1])).not.toBe(canonicalJson([1, 2, 3]));
  });

  it("produces a stable sha256 hex digest", async () => {
    const digest = await sha256Hex("BreastCare AI");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(await sha256Hex("BreastCare AI"));
    expect(digest).not.toBe(await sha256Hex("BreastCare AI "));
  });

  it("derives bytes32 values suitable for Solidity", async () => {
    const value = await bytes32From({ kind: "report", id: "r-1" });
    expect(isBytes32(value)).toBe(true);
  });

  it("separates domains so hashes cannot be confused across subsystems", async () => {
    const payload = { id: "x" };
    expect(await taggedHash("RECORD", payload)).not.toBe(await taggedHash("TREATMENT", payload));
  });

  it("validates address and bytes32 shapes", () => {
    expect(isAddress("0x" + "ab".repeat(20))).toBe(true);
    expect(isAddress("0x" + "ab".repeat(19))).toBe(false);
    expect(isBytes32("0x" + "cd".repeat(32))).toBe(true);
    expect(isBytes32("0x" + "cd".repeat(31))).toBe(false);
  });
});

describe("shared validation schemas", () => {
  it("rejects a weak password and mismatched confirmation on registration", () => {
    const base = {
      email: "patient@example.com",
      displayName: "Demo Patient",
      role: "patient" as const,
      acceptedDisclaimer: true as const,
    };
    expect(registerSchema.safeParse({ ...base, password: "short", confirmPassword: "short" }).success).toBe(false);
    expect(
      registerSchema.safeParse({ ...base, password: "Password1234", confirmPassword: "Password1235" }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ ...base, password: "Password1234", confirmPassword: "Password1234" }).success,
    ).toBe(true);
    expect(
      registerSchema.safeParse({ ...base, password: "Password1234", confirmPassword: "Password1234", acceptedDisclaimer: false }).success,
    ).toBe(false);
  });

  it("normalises login email casing", () => {
    const parsed = loginSchema.parse({ email: "  Patient@Example.COM ", password: "password123" });
    expect(parsed.email).toBe("patient@example.com");
  });

  it("rejects out-of-range symptom durations and unknown severities", () => {
    expect(symptomReportSchema.safeParse({ code: "breast-lump", severity: "mild", side: "left", durationWeeks: 3 }).success).toBe(true);
    expect(symptomReportSchema.safeParse({ code: "breast-lump", severity: "mild", side: "left", durationWeeks: -1 }).success).toBe(false);
    expect(symptomReportSchema.safeParse({ code: "breast-lump", severity: "extreme", side: "left", durationWeeks: 3 }).success).toBe(false);
  });

  it("validates treatment plans and clamps progress", () => {
    expect(
      treatmentPlanSchema.safeParse({ name: "Adjuvant chemotherapy", modality: "chemotherapy", summary: "AC-T regimen", progressPercent: 120 })
        .success,
    ).toBe(false);
    const parsed = treatmentPlanSchema.parse({ name: "Radiotherapy", modality: "radiation", summary: "Whole breast, 15 fractions" });
    expect(parsed.status).toBe("proposed");
    expect(parsed.progressPercent).toBe(0);
  });
});
