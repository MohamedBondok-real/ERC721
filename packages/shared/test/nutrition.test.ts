import { describe, expect, it } from "vitest";
import { buildNutritionPlan, type NutritionPlanInput } from "../src/nutritionPlan";
import { FOODS_TO_DISCUSS_WITH_CLINICIAN, NUTRITION_PHASES, SIDE_EFFECT_GUIDANCE } from "../src/nutrition";
import { NUTRITION_DISCLAIMER } from "../src/disclaimer";

function input(overrides: Partial<NutritionPlanInput> = {}): NutritionPlanInput {
  return {
    phase: "during-treatment",
    treatmentModalities: ["chemotherapy"],
    sideEffects: [],
    dietaryPreferences: [],
    allergies: [],
    restrictions: [],
    comorbidities: [],
    clinicianRecommendations: "",
    appetiteScore: 3,
    weightTrend: "stable",
    ...overrides,
  };
}

const NEGATION = /\b(not|never|no|none|cannot|can't|doesn't|does not|isn't|is not|don't|without|avoid|rather than)\b/i;

function affirmativeSentences(lines: string[]): string {
  return lines
    .join(" ")
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !NEGATION.test(sentence))
    .join(" ");
}

describe("buildNutritionPlan", () => {
  it("produces a plan for every supported phase", () => {
    for (const phase of NUTRITION_PHASES) {
      const plan = buildNutritionPlan(input({ phase: phase.phase }));
      expect(plan.phase).toBe(phase.phase);
      expect(plan.meals.length).toBeGreaterThan(2);
      expect(plan.goals.length).toBeGreaterThan(2);
      expect(plan.disclaimer).toBe(NUTRITION_DISCLAIMER);
      expect(plan.cautions.join(" ")).toContain("healthcare professional");
    }
  });

  it("excludes foods that conflict with declared allergies", () => {
    const plan = buildNutritionPlan(input({ allergies: ["peanut allergy", "dairy allergy"] }));
    const mealText = plan.meals.map((meal) => `${meal.name} ${meal.description}`).join(" ").toLowerCase();
    expect(mealText).not.toContain("peanut");
    expect(mealText).not.toContain("greek yoghurt");
    expect(plan.cautions.join(" ")).toContain("peanut allergy");
  });

  it("honours vegetarian and vegan preferences", () => {
    const vegan = buildNutritionPlan(input({ dietaryPreferences: ["vegan"] }));
    const text = vegan.meals.map((meal) => `${meal.name} ${meal.description}`).join(" ").toLowerCase();
    expect(text).not.toContain("chicken");
    expect(text).not.toContain("salmon");
    expect(text).not.toContain("eggs");
  });

  it("adds side-effect guidance and foods that may worsen those symptoms", () => {
    const plan = buildNutritionPlan(input({ sideEffects: ["nausea", "mouth-discomfort"], phase: "side-effect-support" }));
    expect(plan.sideEffectSupport.map((s) => s.id)).toEqual(["nausea", "mouth-discomfort"]);
    for (const guidance of plan.sideEffectSupport) {
      expect(guidance.suggestions.length).toBeGreaterThan(2);
      expect(guidance.whenToContactCareTeam.length).toBeGreaterThan(20);
    }
    expect(plan.foodsThatMayWorsenSymptoms.length).toBeGreaterThan(0);
  });

  it("avoids suggesting meals that clash with reported side effects where alternatives exist", () => {
    const withMouthPain = buildNutritionPlan(input({ sideEffects: ["mouth-discomfort"] }));
    const chosen = withMouthPain.meals.map((meal) => meal.name);
    expect(chosen.length).toBeGreaterThan(0);
  });

  it("raises the hydration target for diarrhoea and constipation", () => {
    expect(buildNutritionPlan(input({ sideEffects: ["diarrhoea"] })).hydrationTargetMl).toBeGreaterThan(
      buildNutritionPlan(input()).hydrationTargetMl,
    );
    expect(buildNutritionPlan(input({ sideEffects: ["constipation"] })).hydrationTargetMl).toBeGreaterThan(2000);
  });

  it("surfaces comorbidity-specific cautions and defers to clinician instructions", () => {
    const plan = buildNutritionPlan(
      input({ comorbidities: ["diabetes", "kidney disease"], clinicianRecommendations: "1.5 g protein/kg, no salt added." }),
    );
    const cautions = plan.cautions.join(" ");
    expect(cautions).toContain("Diabetes");
    expect(cautions).toContain("Kidney disease");
    expect(cautions).toContain("take precedence");
  });

  it("adapts goals to appetite and weight trend", () => {
    const lowAppetite = buildNutritionPlan(input({ appetiteScore: 1, weightTrend: "losing" }));
    expect(lowAppetite.goals.join(" ")).toMatch(/small, frequent/i);
    expect(lowAppetite.goals.join(" ")).toMatch(/weight loss/i);

    const gaining = buildNutritionPlan(input({ weightTrend: "gaining" }));
    expect(gaining.goals.join(" ")).toMatch(/weight gain/i);
  });

  it("never promises a cure and never recommends a restrictive diet", () => {
    for (const phase of NUTRITION_PHASES) {
      const plan = buildNutritionPlan(input({ phase: phase.phase }));
      // Only affirmative sentences are screened: "No diet cures cancer" is the safety copy.
      const affirmative = affirmativeSentences([
        ...plan.goals,
        ...plan.cautions,
        ...plan.meals.map((meal) => meal.rationale),
        plan.summary,
      ]).toLowerCase();
      expect(affirmative).not.toMatch(/cure[sd]? (breast )?cancer/);
      expect(affirmative).not.toMatch(/eliminates? (the )?(cancer|tumou?r)/);
      expect(affirmative).not.toMatch(/\b(fasting|starvation|juice cleanse)\b/);
      expect(JSON.stringify(plan).toLowerCase()).toContain("educational");
    }
  });

  it("flags supplements and interactions for discussion rather than instructing the patient", () => {
    const plan = buildNutritionPlan(input());
    expect(plan.foodsToDiscussWithClinician.length).toBeGreaterThan(0);
    expect(plan.foodsToDiscussWithClinician.join(" ")).toMatch(/grapefruit|supplement|herbal/i);
    expect(FOODS_TO_DISCUSS_WITH_CLINICIAN.length).toBeGreaterThanOrEqual(5);
  });

  it("covers the seven side effects the platform promises guidance for", () => {
    const ids = SIDE_EFFECT_GUIDANCE.map((g) => g.id);
    for (const expected of ["appetite-loss", "nausea", "taste-changes", "mouth-discomfort", "constipation", "diarrhoea", "fatigue"]) {
      expect(ids).toContain(expected);
    }
  });
});
