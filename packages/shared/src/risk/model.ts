import type { RiskAssessmentResult, RiskFactor } from "./types";
import type { AssessmentUrgency, RiskLevel } from "../types";

/* ------------------------------------------------------------------ */
/* Model interface — the seam that lets a validated ML model replace   */
/* the educational rule engine without touching any caller.            */
/* ------------------------------------------------------------------ */

export interface RiskAssessmentInput {
  age: number;
  biologicalSex?: "female" | "male" | "other" | "prefer-not-to-say";

  familyHistory: {
    firstDegreeRelativesWithBreastCancer: number;
    maleRelativeWithBreastCancer: boolean;
    relativeDiagnosedBefore50: boolean;
    ovarianOrPancreaticCancerInFamily: boolean;
    knownPathogenicVariant: boolean; // e.g. BRCA1/BRCA2, PALB2
    ashkenaziJewishAncestry: boolean;
  };

  personalHistory: {
    previousBreastCancer: boolean;
    previousBenignBreastDisease: boolean;
    atypicalHyperplasiaOrLcis: boolean;
    chestRadiationBeforeAge30: boolean;
    otherCancerHistory: boolean;
  };

  reproductiveHistory: {
    menarcheBefore12: boolean;
    menopauseAfter55: boolean;
    firstLiveBirthAfter30: boolean;
    neverGaveBirth: boolean;
    neverBreastfed: boolean;
    combinedHormoneTherapy: boolean;
    currentHormoneTherapy: boolean;
  };

  lifestyle: {
    bmi: number | null;
    alcoholUnitsPerWeek: number;
    physicalActivity: "low" | "moderate" | "high";
    smokingStatus: "never" | "former" | "current";
    postmenopausal: boolean;
  };

  screening: {
    lastMammogramMonthsAgo: number | null;
    denseBreastTissue: boolean;
    screeningUpToDate: boolean;
  };

  symptoms: ReportedSymptom[];
}

export interface ReportedSymptom {
  code: string;
  label: string;
  durationWeeks: number;
  unilateral: boolean;
  progressive: boolean;
  severe: boolean;
}

export interface RiskAssessmentModel {
  /** Stable identifier, e.g. `rule-based-educational-v1`. */
  readonly id: string;
  /** Semantic version of the model, surfaced in the UI and audit trail. */
  readonly version: string;
  /** Human label shown next to every result. */
  readonly label: string;
  /** Short description of what the model is and — crucially — is not. */
  readonly description: string;
  /** Evaluate a patient's answers and produce an educational risk result. */
  evaluate(input: RiskAssessmentInput): RiskAssessmentResult;
}

/* ------------------------------------------------------------------ */
/* Result construction helpers shared by every model implementation    */
/* ------------------------------------------------------------------ */

export const RISK_LEVELS: RiskLevel[] = ["low", "moderate", "high"];

export function normalizeScore(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return Math.max(0, Math.min(1, score / maxScore));
}

export function levelForNormalized(normalized: number): RiskLevel {
  if (normalized >= 0.6) return "high";
  if (normalized >= 0.3) return "moderate";
  return "low";
}

export function urgencyForLevel(level: RiskLevel, hasRedFlag: boolean): AssessmentUrgency {
  if (hasRedFlag) return "prompt";
  if (level === "high") return "soon";
  if (level === "moderate") return "soon";
  return "routine";
}

export function factor(
  id: string,
  label: string,
  category: string,
  points: number,
  explanation: string,
  severity: RiskFactor["severity"] = "informational",
): RiskFactor {
  return { id, label, category, points, weight: points, severity, explanation };
}

export const BASE_DISCLAIMERS: string[] = [
  "BreastCare AI provides an educational, AI-assisted risk assessment. It is not a diagnosis.",
  "Only a qualified healthcare professional can evaluate your symptoms and recommend tests or treatment.",
  "A low result does not guarantee the absence of disease, and a high result does not mean you have cancer.",
  "If you have noticed a new or changing breast symptom, arrange a clinical evaluation regardless of this result.",
];
