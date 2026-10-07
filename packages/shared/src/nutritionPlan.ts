import {
  FOODS_THAT_MAY_WORSEN_SYMPTOMS,
  FOODS_TO_DISCUSS_WITH_CLINICIAN,
  FOODS_TO_EMPHASIZE,
  MEAL_LIBRARY,
  NUTRITION_PHASES,
  SIDE_EFFECT_GUIDANCE,
  type MealTemplate,
  type NutritionPhaseContent,
} from "./nutrition";
import { NUTRITION_DISCLAIMER } from "./disclaimer";
import type { MealSuggestion, NutritionPhase, SideEffectGuidance } from "./types";

/* ------------------------------------------------------------------ */
/* Personalised nutrition plan builder (educational)                   */
/* ------------------------------------------------------------------ */

export interface NutritionPlanInput {
  phase: NutritionPhase;
  /** Treatment currently being received, if any. */
  treatmentModalities: string[];
  /** Side-effect ids reported by the patient (see SIDE_EFFECT_GUIDANCE). */
  sideEffects: string[];
  dietaryPreferences: string[]; // vegetarian, vegan, pescatarian, halal, kosher, ...
  allergies: string[];
  restrictions: string[]; // dairy-free, gluten-free, nut-free, soya-free, ...
  comorbidities: string[]; // diabetes, kidney-disease, ...
  clinicianRecommendations: string;
  appetiteScore: number; // 0 (none) – 5 (normal)
  weightTrend: "losing" | "stable" | "gaining" | "unknown";
  hydrationTargetMl?: number;
}

export interface NutritionPlanDraft {
  phase: NutritionPhase;
  title: string;
  summary: string;
  goals: string[];
  meals: MealSuggestion[];
  foodsToEmphasize: string[];
  foodsToDiscussWithClinician: string[];
  foodsThatMayWorsenSymptoms: { food: string; reason: string }[];
  sideEffectSupport: SideEffectGuidance[];
  cautions: string[];
  hydrationTargetMl: number;
  calorieTargetKcal: number | null;
  proteinTargetGrams: number | null;
  disclaimer: string;
}

const ALLERGY_CONFLICTS: Record<string, string[]> = {
  "nut allergy": ["nut-free"],
  "peanut allergy": ["nut-free"],
  "dairy allergy": ["dairy-free"],
  "lactose intolerance": ["dairy-free"],
  "gluten allergy": ["gluten-free"],
  "coeliac disease": ["gluten-free"],
  "egg allergy": ["egg-free"],
  "fish allergy": ["fish-free"],
  "shellfish allergy": ["fish-free"],
  "soya allergy": ["soya-free"],
  "sesame allergy": ["sesame-free"],
};

const COMORBIDITY_NOTES: Record<string, string> = {
  diabetes:
    "Diabetes: carbohydrate targets and timing should be set with your diabetes team, particularly if you are on insulin or a steroid course during treatment.",
  "kidney disease":
    "Kidney disease: protein, potassium and phosphate targets differ from general guidance and must be set by your renal team or dietitian.",
  "heart disease":
    "Heart conditions: sodium and fluid targets may be restricted; confirm them with your cardiologist before changing salt or fluid intake.",
  "hypertension": "High blood pressure: favour lower-sodium cooking and confirm any fluid advice with your team.",
  "crohn's disease":
    "Inflammatory bowel disease: fibre advice during a flare differs from general guidance — follow your gastroenterology team's plan.",
  "ibs": "IBS: reintroduce fibre slowly and keep a symptom diary; a dietitian can guide a structured elimination approach if needed.",
};

/**
 * Build an educational nutrition plan.
 *
 * This function is deliberately deterministic and rule-based: every suggestion it makes
 * is traceable to the knowledge base in `nutrition.ts`, and it never produces a
 * restrictive diet, a therapeutic claim, or a dosage.
 */
export function buildNutritionPlan(input: NutritionPlanInput): NutritionPlanDraft {
  const phaseContent = NUTRION_PHASES_FOR(input.phase);
  const restrictions = normaliseRestrictions(input);

  const meals = selectMeals(input, restrictions);
  const sideEffectSupport = SIDE_EFFECT_GUIDANCE.filter((guidance) => input.sideEffects.includes(guidance.id));

  const goals = buildGoals(input, phaseContent, meals);
  const cautions = buildCautions(input, phaseContent);

  const foodsToDiscuss = FOODS_TO_DISCUSS_WITH_CLINICIAN.filter((caution) =>
    input.phase === "side-effect-support" ? true : caution.categories.includes(input.phase),
  ).map((caution) => `${caution.food} — ${caution.reason}`);

  const foodsThatMayWorsenSymptoms = FOODS_THAT_MAY_WORSEN_SYMPTOMS.filter((item) =>
    input.sideEffects.includes(item.symptomId),
  ).map(({ food, reason }) => ({ food, reason }));

  const hydrationTargetMl = input.hydrationTargetMl ?? defaultHydrationTarget(input);

  return {
    phase: input.phase,
    title: `${phaseContent.title} — personalised educational plan`,
    summary: phaseContent.summary,
    goals,
    meals,
    foodsToEmphasize: FOODS_TO_EMPHASIZE.map((group) => `${group.name}: ${group.examples.slice(0, 4).join(", ")} — ${group.rationale}`),
    foodsToDiscussWithClinician: foodsToDiscuss,
    foodsThatMayWorsenSymptoms,
    sideEffectSupport,
    cautions,
    hydrationTargetMl,
    calorieTargetKcal: null,
    proteinTargetGrams: null,
    disclaimer: NUTRITION_DISCLAIMER,
  };
}

function NUTRION_PHASES_FOR(phase: NutritionPhase) {
  return NUTRITION_PHASES.find((p) => p.phase === phase) ?? NUTRITION_PHASES[0]!;
}

function normaliseRestrictions(input: NutritionPlanInput): string[] {
  const set = new Set<string>([...input.restrictions]);
  for (const allergy of input.allergies) {
    const mapped = ALLERGY_CONFLICTS[allergy.toLowerCase().trim()];
    if (mapped) mapped.forEach((restriction) => set.add(restriction));
  }
  return [...set];
}

function selectMeals(input: NutritionPlanInput, restrictions: string[]): MealSuggestion[] {
  const preferences = new Set(input.dietaryPreferences.map((p) => p.toLowerCase()));
  const excludeTags = new Set<string>();
  if (preferences.has("vegan")) ["vegetarian", "vegan"].forEach(() => excludeTags.add("non-vegan"));
  if (preferences.has("vegetarian") || preferences.has("vegan")) excludeTags.add("non-veg");
  if (preferences.has("pescatarian")) excludeTags.add("non-pescatarian");

  const candidates = MEAL_LIBRARY.filter((meal) => isCompatible(meal, input, restrictions, excludeTags));

  // Fill each slot, preferring meals that avoid the patient's current side effects.
  const slots: MealSuggestion["slot"][] = ["breakfast", "mid-morning", "lunch", "afternoon", "dinner", "evening"];
  const selected: MealSuggestion[] = [];

  for (const slot of slots) {
    const forSlot = candidates.filter((meal) => meal.slot === slot);
    if (forSlot.length === 0) continue;
    const scored = [...forSlot].sort((a, b) => sideEffectScore(b, input) - sideEffectScore(a, input));
    const pick = scored[0]!;
    selected.push({
      id: `${slot}-${pick.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      slot,
      name: pick.name,
      description: pick.description,
      rationale: pick.rationale,
      approximateKcal: pick.approximateKcal,
      proteinGrams: pick.proteinGrams,
      tags: pick.tags,
    });
  }

  return selected;
}

function sideEffectScore(meal: MealTemplate, input: NutritionPlanInput): number {
  return input.sideEffects.filter((sideEffect) => meal.avoidWithSideEffects.includes(sideEffect)).length;
}

function isCompatible(
  meal: MealTemplate,
  input: NutritionPlanInput,
  restrictions: string[],
  excludeTags: Set<string>,
): boolean {
  if (!meal.phases.includes(input.phase) && input.phase !== "side-effect-support") return false;
  for (const restriction of restrictions) {
    if (meal.excludedBy.includes(restriction)) return false;
  }
  const preferences = new Set(input.dietaryPreferences.map((p) => p.toLowerCase()));
  if ((preferences.has("vegan") || preferences.has("vegetarian")) && !meal.tags.some((t) => t === "vegan" || t === "vegetarian")) {
    return false;
  }
  if (preferences.has("pescatarian") && meal.tags.some((t) => t === "high-protein") && !meal.tags.includes("pescatarian") && !meal.tags.includes("vegetarian") && !meal.tags.includes("vegan")) {
    return false;
  }
  if (preferences.has("gluten-free") && meal.tags.includes("gluten-free") === false && meal.excludedBy.includes("gluten-free")) {
    return false;
  }
  void excludeTags;
  return true;
}

function buildGoals(input: NutritionPlanInput, phase: NutritionPhaseContent, meals: MealSuggestion[]): string[] {
  const goals: string[] = [];
  const totalKcal = meals.reduce((sum, meal) => sum + meal.approximateKcal, 0);
  const totalProtein = meals.reduce((sum, meal) => sum + meal.proteinGrams, 0);

  goals.push(
    `The example day below provides roughly ${totalKcal} kcal and ${totalProtein} g of protein. Your actual targets should be set by your clinical team or dietitian.`,
  );

  if (input.appetiteScore <= 2) {
    goals.push("Prioritise small, frequent, energy-dense portions while your appetite is low — eating something every 2–3 hours is more realistic than three full meals.");
  }
  if (input.weightTrend === "losing") {
    goals.push("You have reported weight loss: mention this at your next appointment, and consider asking for a dietitian referral to protect your weight through treatment.");
  }
  if (input.weightTrend === "gaining") {
    goals.push("You have reported weight gain: this is common during and after treatment. A gradual, sustainable plan agreed with your team is safer than a restrictive diet.");
  }
  if (input.sideEffects.length > 0) {
    goals.push("Adapt texture, temperature and timing to your current side effects rather than removing whole food groups.");
  }
  if (input.treatmentModalities.length > 0) {
    goals.push(
      `Your reported treatment (${input.treatmentModalities.join(", ")}) influences nutritional needs; confirm targets with the team delivering that treatment.`,
    );
  }
  goals.push(`Hydration target used for this plan: about ${input.hydrationTargetMl ?? 2000} ml of fluid per day unless your team has advised otherwise.`);
  goals.push(...phase.priorities.slice(0, 2));
  return goals;
}

function buildCautions(input: NutritionPlanInput, phase: NutritionPhaseContent): string[] {
  const cautions = [...phase.cautions];
  for (const comorbidity of input.comorbidities) {
    const note = COMORBIDITY_NOTES[comorbidity.toLowerCase().trim()];
    if (note) cautions.push(note);
  }
  if (input.allergies.length > 0) {
    cautions.push(`Declared allergies (${input.allergies.join(", ")}) have been used to exclude suggestions. Always check labels and confirm substitutions with your team.`);
  }
  if (input.clinicianRecommendations.trim().length > 0) {
    cautions.push(`Your clinician's recommendations take precedence over anything in this plan: "${input.clinicianRecommendations.trim()}"`);
  }
  cautions.push(NUTRITION_DISCLAIMER);
  return cautions;
}

function defaultHydrationTarget(input: NutritionPlanInput): number {
  if (input.sideEffects.includes("diarrhoea")) return 2600;
  if (input.sideEffects.includes("constipation")) return 2400;
  if (input.appetiteScore <= 2) return 2200;
  return 2000;
}
