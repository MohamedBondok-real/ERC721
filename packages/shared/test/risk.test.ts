import { describe, expect, it } from "vitest";
import {
  BASE_DISCLAIMERS,
  RuleBasedEducationalRiskModel,
  SYMPTOM_CATALOGUE,
  getActiveRiskModel,
  listRiskModels,
  registerRiskModel,
  setActiveRiskModel,
  type RiskAssessmentInput,
  type RiskAssessmentModel,
} from "../src/risk";
import type { RiskAssessmentResult } from "../src/risk";

function baseline(overrides: Partial<RiskAssessmentInput> = {}): RiskAssessmentInput {
  return {
    age: 45,
    biologicalSex: "female",
    familyHistory: {
      firstDegreeRelativesWithBreastCancer: 0,
      maleRelativeWithBreastCancer: false,
      relativeDiagnosedBefore50: false,
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
      menarcheBefore12: false,
      menopauseAfter55: false,
      firstLiveBirthAfter30: false,
      neverGaveBirth: false,
      neverBreastfed: false,
      combinedHormoneTherapy: false,
      currentHormoneTherapy: false,
    },
    lifestyle: {
      bmi: 24,
      alcoholUnitsPerWeek: 2,
      physicalActivity: "moderate",
      smokingStatus: "never",
      postmenopausal: false,
    },
    screening: { lastMammogramMonthsAgo: 12, denseBreastTissue: false, screeningUpToDate: true },
    symptoms: [],
    ...overrides,
  };
}

const model = new RuleBasedEducationalRiskModel();

const NEGATION = /\b(not|never|no|none|cannot|can't|doesn't|does not|isn't|is not|don't|without|avoid|rather than)\b/i;

/** Keep only sentences that make an affirmative claim. */
function affirmativeSentences(lines: string[]): string {
  return lines
    .join(" ")
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !NEGATION.test(sentence))
    .join(" ");
}

describe("RuleBasedEducationalRiskModel", () => {
  it("returns a low result for a low-risk profile and labels itself as educational", () => {
    const result = model.evaluate(baseline());
    expect(result.level).toBe("low");
    expect(result.urgency).toBe("routine");
    expect(result.modelId).toBe("rule-based-educational");
    expect(result.modelName).toContain("educational");
    expect(result.disclaimers).toEqual(BASE_DISCLAIMERS);
    expect(result.maxScore).toBe(160);
    expect(result.score).toBeLessThan(result.maxScore);
  });

  it("rises to high with a strong family-history and personal-history profile", () => {
    const result = model.evaluate(
      baseline({
        age: 68,
        familyHistory: {
          firstDegreeRelativesWithBreastCancer: 2,
          maleRelativeWithBreastCancer: true,
          relativeDiagnosedBefore50: true,
          ovarianOrPancreaticCancerInFamily: true,
          knownPathogenicVariant: true,
          ashkenaziJewishAncestry: true,
        },
        personalHistory: {
          previousBreastCancer: true,
          previousBenignBreastDisease: true,
          atypicalHyperplasiaOrLcis: true,
          chestRadiationBeforeAge30: true,
          otherCancerHistory: false,
        },
        screening: { lastMammogramMonthsAgo: null, denseBreastTissue: true, screeningUpToDate: false },
      }),
    );
    expect(result.level).toBe("high");
    expect(result.urgency).toBe("soon");
    expect(result.score).toBeGreaterThan(100);
    expect(result.factors[0]?.severity).toBe("significant");
  });

  it("reports every contributing factor with a plain-language explanation", () => {
    const result = model.evaluate(
      baseline({
        familyHistory: { ...baseline().familyHistory, firstDegreeRelativesWithBreastCancer: 1 },
        lifestyle: { bmi: 34, alcoholUnitsPerWeek: 18, physicalActivity: "low", smokingStatus: "current", postmenopausal: true },
      }),
    );
    expect(result.factors.length).toBeGreaterThan(5);
    for (const factor of result.factors) {
      expect(factor.explanation.length).toBeGreaterThan(20);
      expect(factor.points).toBeGreaterThan(0);
      expect(factor.category).toBeTruthy();
    }
    // Factors are ordered by contribution, largest first.
    const points = result.factors.map((f) => f.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });

  it("flags a red-flag symptom and recommends professional evaluation", () => {
    const result = model.evaluate(
      baseline({
        symptoms: [
          {
            code: "nipple-discharge",
            label: "Nipple discharge",
            durationWeeks: 3,
            unilateral: true,
            progressive: true,
            severe: false,
          },
        ],
      }),
    );
    expect(result.redFlags.length).toBeGreaterThan(0);
    expect(result.urgency).toBe("prompt");
    expect(result.level).not.toBe("low");
    expect(result.guidance.join(" ")).toMatch(/professional medical evaluation may be appropriate/i);
  });

  it("never claims a diagnosis in any guidance line", () => {
    const inputs = [
      baseline(),
      baseline({ symptoms: [{ code: "breast-lump", label: "Lump", durationWeeks: 6, unilateral: true, progressive: true, severe: true }] }),
    ];
    for (const input of inputs) {
      const result = model.evaluate(input);
      // Negated sentences ("does not mean you have cancer") are the safety copy itself, so
      // only *affirmative* statements are screened for diagnostic claims.
      const affirmative = affirmativeSentences([...result.guidance, ...result.disclaimers]).toLowerCase();
      expect(affirmative).not.toMatch(/you have (breast )?cancer/);
      expect(affirmative).not.toMatch(/you are (cancer|diagnosed)/);
      expect(affirmative).not.toMatch(/confirms? cancer/);
      expect(result.disclaimers.join(" ")).toContain("not a diagnosis");
    }
  });

  it("keeps every symptom in the catalogue covered by guidance and an educational note", () => {
    expect(SYMPTOM_CATALOGUE.length).toBeGreaterThanOrEqual(10);
    for (const symptom of SYMPTOM_CATALOGUE) {
      expect(symptom.guidance.length).toBeGreaterThan(30);
      expect(symptom.points).toBeGreaterThan(0);
      const result = model.evaluate(
        baseline({
          symptoms: [{ code: symptom.code, label: symptom.label, durationWeeks: 5, unilateral: true, progressive: true, severe: false }],
        }),
      );
      expect(result.factors.some((f) => f.id === `sym.${symptom.code}`)).toBe(true);
    }
  });

  it("caps the score at the published maximum", () => {
    const result = model.evaluate(
      baseline({
        age: 80,
        familyHistory: {
          firstDegreeRelativesWithBreastCancer: 6,
          maleRelativeWithBreastCancer: true,
          relativeDiagnosedBefore50: true,
          ovarianOrPancreaticCancerInFamily: true,
          knownPathogenicVariant: true,
          ashkenaziJewishAncestry: true,
        },
        personalHistory: {
          previousBreastCancer: true,
          previousBenignBreastDisease: true,
          atypicalHyperplasiaOrLcis: true,
          chestRadiationBeforeAge30: true,
          otherCancerHistory: true,
        },
        reproductiveHistory: {
          menarcheBefore12: true,
          menopauseAfter55: true,
          firstLiveBirthAfter30: true,
          neverGaveBirth: true,
          neverBreastfed: true,
          combinedHormoneTherapy: true,
          currentHormoneTherapy: true,
        },
        lifestyle: { bmi: 40, alcoholUnitsPerWeek: 30, physicalActivity: "low", smokingStatus: "current", postmenopausal: true },
        screening: { lastMammogramMonthsAgo: null, denseBreastTissue: true, screeningUpToDate: false },
        symptoms: SYMPTOM_CATALOGUE.map((s) => ({
          code: s.code,
          label: s.label,
          durationWeeks: 8,
          unilateral: true,
          progressive: true,
          severe: true,
        })),
      }),
    );
    expect(result.score).toBe(result.maxScore);
    expect(result.normalizedScore).toBe(1);
    expect(result.level).toBe("high");
  });
});

describe("risk model registry", () => {
  it("exposes the rule-based model as the default active model", () => {
    expect(listRiskModels().some((m) => m.id === "rule-based-educational" && m.active)).toBe(true);
    expect(getActiveRiskModel().id).toBe("rule-based-educational");
  });

  it("allows a replacement model to be registered and activated without touching callers", () => {
    class StubValidatedModel implements RiskAssessmentModel {
      readonly id = "stub-validated";
      readonly version = "0.1.0";
      readonly label = "Stub validated model";
      readonly description = "Test double standing in for a validated ML model.";
      evaluate(): RiskAssessmentResult {
        return {
          modelName: this.label,
          modelId: this.id,
          modelVersion: this.version,
          level: "moderate",
          score: 50,
          maxScore: 100,
          normalizedScore: 0.5,
          urgency: "soon",
          factors: [],
          guidance: ["Educational output from the replacement model."],
          redFlags: [],
          disclaimers: BASE_DISCLAIMERS,
          evaluatedAt: new Date().toISOString(),
        };
      }
    }

    registerRiskModel(new StubValidatedModel());
    setActiveRiskModel("stub-validated");
    expect(getActiveRiskModel().id).toBe("stub-validated");
    expect(getActiveRiskModel().evaluate(baseline()).level).toBe("moderate");

    // Restore the default so other tests are unaffected.
    setActiveRiskModel("rule-based-educational");
    expect(getActiveRiskModel().id).toBe("rule-based-educational");
    expect(() => setActiveRiskModel("does-not-exist")).toThrow(/Unknown risk assessment model/);
  });
});
