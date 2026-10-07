import { describe, expect, it } from "vitest";
import {
  DEMO_DATA_BANNER,
  MEDICAL_DISCLAIMER,
  RISK_ASSESSMENT_DISCLAIMER,
  type AssessmentUrgency,
  type RiskLevel,
} from "@breastcare/shared";
import { APPOINTMENT_COPY, CONSENT_COPY, DOSE_COPY, MEDICATION_COPY, RISK_COPY, SEVERITY_COPY, TREATMENT_COPY, URGENCY_COPY } from "./format";

/**
 * Safety-copy tests.
 *
 * The risk display must never read as a diagnosis, so these assert on wording, not just on the
 * presence of a key. `affirmativeSentences` strips negated clauses so "does not provide a
 * diagnosis" is not mistaken for a diagnostic claim.
 */

const DIAGNOSTIC_CLAIMS = [
  /you have (breast )?cancer/i,
  /you are (?:diagnosed|confirmed)/i,
  /your diagnosis is/i,
  /confirms? (?:a )?diagnosis/i,
  /cancer positive/i,
];

function affirmativeSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    // A negated clause is a disclaimer, not a claim.
    .filter((sentence) => !/\b(not|never|no|cannot|does not|doesn't|isn't|aren't)\b/i.test(sentence));
}

function makesAffirmativeClaim(text: string): boolean {
  return affirmativeSentences(text).some((sentence) => DIAGNOSTIC_CLAIMS.some((pattern) => pattern.test(sentence)));
}

describe("risk indicator wording", () => {
  const levels: RiskLevel[] = ["low", "moderate", "high"];

  it("covers every risk level", () => {
    for (const level of levels) {
      expect(RISK_COPY[level]).toBeDefined();
      expect(RISK_COPY[level]!.label).toMatch(/risk indicators/i);
    }
  });

  it("never states or implies a diagnosis", () => {
    for (const level of levels) {
      const copy = RISK_COPY[level]!;
      expect(makesAffirmativeClaim(`${copy.label}. ${copy.summary}`)).toBe(false);
    }
  });

  it("points moderate and high results at a clinician", () => {
    expect(RISK_COPY.moderate!.summary).toMatch(/professional medical evaluation/i);
    expect(RISK_COPY.high!.summary).toMatch(/professional medical evaluation/i);
  });

  it("keeps low results honest about continued screening", () => {
    expect(RISK_COPY.low!.summary).toMatch(/screening|awareness/i);
  });

  it("labels urgency as a suggestion, not an instruction", () => {
    const urgencies: AssessmentUrgency[] = ["routine", "soon", "prompt"];
    for (const urgency of urgencies) {
      expect(URGENCY_COPY[urgency]).toBeDefined();
      expect(makesAffirmativeClaim(URGENCY_COPY[urgency]!.guidance)).toBe(false);
    }
  });
});

describe("clinical label maps", () => {
  it("label every treatment status", () => {
    expect(Object.keys(TREATMENT_COPY).sort()).toEqual(
      ["active", "authorized", "cancelled", "completed", "on-hold", "proposed"].sort(),
    );
  });

  it("label every appointment status", () => {
    expect(Object.keys(APPOINTMENT_COPY).sort()).toEqual(
      ["cancelled", "completed", "confirmed", "no-show", "requested"].sort(),
    );
  });

  it("label every medication and consent status", () => {
    expect(Object.keys(MEDICATION_COPY).sort()).toEqual(["active", "completed", "discontinued", "paused"].sort());
    expect(Object.keys(CONSENT_COPY).sort()).toEqual(["active", "expired", "pending", "revoked"].sort());
  });

  it("label every dose and symptom severity", () => {
    expect(Object.keys(DOSE_COPY).sort()).toEqual(["missed", "pending", "skipped", "taken"].sort());
    expect(Object.keys(SEVERITY_COPY).sort()).toEqual(["mild", "moderate", "severe"].sort());
  });
});

describe("platform disclaimers", () => {
  it("carry the medical disclaimer verbatim", () => {
    expect(MEDICAL_DISCLAIMER).toBe(
      "BreastCare AI is an educational and clinical decision-support platform. It does not provide a medical diagnosis or replace a qualified healthcare professional. Risk assessments and nutrition information are informational only. Always consult an appropriately qualified healthcare professional for diagnosis and treatment decisions.",
    );
  });

  it("state that the risk assessment is not a diagnosis", () => {
    expect(RISK_ASSESSMENT_DISCLAIMER.toLowerCase()).toContain("not a diagnosis");
  });

  it("label the demo data unambiguously", () => {
    expect(DEMO_DATA_BANNER).toBe("FICTIONAL DEMO DATA — NOT REAL PATIENT INFORMATION");
  });
});
