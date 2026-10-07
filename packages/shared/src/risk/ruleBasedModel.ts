import type { RiskAssessmentResult, RiskFactor } from "./types";
import {
  BASE_DISCLAIMERS,
  factor,
  levelForNormalized,
  normalizeScore,
  type ReportedSymptom,
  type RiskAssessmentInput,
  type RiskAssessmentModel,
  urgencyForLevel,
} from "./model";
import type { RiskLevel } from "../types";

/* ------------------------------------------------------------------ */
/* Symptom catalogue                                                   */
/* ------------------------------------------------------------------ */

export interface SymptomDefinition {
  code: string;
  label: string;
  /** Educational description shown in the questionnaire. */
  description: string;
  /** Base points contributed when reported. */
  points: number;
  /** Educational guidance returned to the patient when this symptom is reported. */
  guidance: string;
  /** Matches a pattern that warrants prompt clinical evaluation. */
  redFlagPattern?: (symptom: ReportedSymptom) => boolean;
  redFlagText?: string;
}

export const SYMPTOM_CATALOGUE: SymptomDefinition[] = [
  {
    code: "breast-lump",
    label: "New lump or thickening in the breast or armpit",
    description: "A new area that feels different from the surrounding tissue.",
    points: 24,
    guidance:
      "Most breast lumps are not cancer, but any new lump should be examined by a clinician. Please arrange an appointment rather than waiting to see whether it resolves.",
    redFlagPattern: (s) => s.durationWeeks >= 2 || s.progressive,
    redFlagText:
      "A new lump present for two weeks or more, or one that is changing, should be evaluated promptly by a healthcare professional.",
  },
  {
    code: "breast-shape-change",
    label: "Change in breast size, shape or contour",
    description: "A noticeable difference between the breasts that is new for you.",
    points: 14,
    guidance:
      "Breast asymmetry is common and usually benign. A new, persistent change is still worth a clinical examination so it can be documented and assessed.",
    redFlagPattern: (s) => s.progressive && s.durationWeeks >= 4,
    redFlagText:
      "A progressive change in breast shape over a month or more should be reviewed by a clinician.",
  },
  {
    code: "skin-dimpling",
    label: "Dimpling, puckering or pulling of the skin",
    description: "Skin that dents or gathers, sometimes described as an orange-peel texture.",
    points: 22,
    guidance:
      "Skin dimpling can have benign causes but is a recognised reason for prompt clinical assessment. Please book an appointment.",
    redFlagPattern: () => true,
    redFlagText:
      "New skin dimpling or puckering should be assessed promptly by a healthcare professional.",
  },
  {
    code: "skin-thickening",
    label: "Thickening, redness or scaling of breast skin",
    description: "Skin that feels thicker, warmer or looks redder than usual.",
    points: 20,
    guidance:
      "This can be caused by infection or inflammation, and it can also be a sign that needs urgent assessment. Please seek medical advice soon.",
    redFlagPattern: (s) => s.progressive || s.severe,
    redFlagText:
      "Progressive thickening, redness or warmth of the breast skin warrants urgent medical evaluation.",
  },
  {
    code: "nipple-retraction",
    label: "Nipple turning inward or changing position",
    description: "A nipple that has newly become inverted or shifted.",
    points: 20,
    guidance:
      "Some people have inverted nipples from birth, which is not concerning. A new inversion should be examined by a clinician.",
    redFlagPattern: () => true,
    redFlagText: "New nipple inversion should be evaluated by a healthcare professional.",
  },
  {
    code: "nipple-discharge",
    label: "Nipple discharge that is not breast milk",
    description: "Any fluid leaving the nipple when you are not breastfeeding.",
    points: 18,
    guidance:
      "Discharge is often benign, especially when it comes from both breasts. Discharge that is spontaneous, from one breast only, or blood-stained should be assessed by a clinician.",
    redFlagPattern: (s) => s.unilateral || s.severe,
    redFlagText:
      "Spontaneous discharge from a single nipple, particularly if blood-stained, should be evaluated promptly.",
  },
  {
    code: "nipple-rash",
    label: "Persistent rash, crusting or itching of the nipple",
    description: "A rash around the nipple that does not settle with ordinary skin care.",
    points: 16,
    guidance:
      "A persistent nipple-area rash that does not improve within a few weeks should be reviewed by a clinician.",
    redFlagPattern: (s) => s.durationWeeks >= 4,
    redFlagText: "A nipple rash persisting beyond four weeks should be clinically assessed.",
  },
  {
    code: "localized-pain",
    label: "Persistent pain in one specific area",
    description: "Pain that stays in the same spot rather than moving with your cycle.",
    points: 10,
    guidance:
      "Breast pain is very common and is rarely a sign of cancer, particularly when it comes and goes. Pain that stays in one place for weeks is worth mentioning to a clinician.",
    redFlagPattern: (s) => s.severe && s.durationWeeks >= 4,
    redFlagText: "Severe, persistent, localised breast pain should be assessed.",
  },
  {
    code: "swelling-no-lump",
    label: "Swelling of part or all of a breast",
    description: "Swelling without a distinct lump that you can feel.",
    points: 16,
    guidance:
      "Swelling can follow injury or infection. If it persists or worsens, please have it examined.",
    redFlagPattern: (s) => s.progressive,
    redFlagText: "Progressive breast swelling without a clear cause should be evaluated promptly.",
  },
  {
    code: "axillary-lump",
    label: "Lump or swelling in the armpit or above the collarbone",
    description: "A new lump in the lymph-node areas near the breast.",
    points: 18,
    guidance:
      "Lymph nodes often enlarge with infection. A new lump in the armpit or above the collarbone that persists should be examined.",
    redFlagPattern: (s) => s.durationWeeks >= 3,
    redFlagText: "A persistent lump in the armpit or above the collarbone should be evaluated.",
  },
  {
    code: "redness-warmth",
    label: "Breast that is red, hot or rapidly enlarging",
    description: "Signs that may indicate infection or an inflammatory process.",
    points: 18,
    guidance:
      "A hot, red, rapidly changing breast needs same-day or next-day medical assessment to rule out infection and other causes.",
    redFlagPattern: () => true,
    redFlagText:
      "A red, hot or rapidly enlarging breast requires urgent medical assessment — contact your care team or an urgent-care service today.",
  },
  {
    code: "persistent-change",
    label: "Any other change that has lasted more than a few weeks",
    description: "Something that feels different and has not gone back to normal.",
    points: 12,
    guidance:
      "Knowing what is normal for you is valuable. Any change that persists for more than a few weeks deserves a professional opinion.",
    redFlagPattern: (s) => s.durationWeeks >= 6,
    redFlagText: "A change persisting beyond six weeks should be reviewed by a clinician.",
  },
];

export function symptomDefinition(code: string): SymptomDefinition | undefined {
  return SYMPTOM_CATALOGUE.find((s) => s.code === code);
}

/* ------------------------------------------------------------------ */
/* Rule-based educational model                                        */
/* ------------------------------------------------------------------ */

/**
 * Transparent, rule-based educational risk model.
 *
 * The scoring is deliberately simple and auditable: every point awarded is reported
 * back to the patient as a named factor with a plain-language explanation, so nothing
 * is hidden inside an opaque model. It is intentionally *not* calibrated to absolute
 * cancer probability and must never be presented as one.
 *
 * To integrate a validated ML model later, implement `RiskAssessmentModel` and register
 * it with the model registry — no other code needs to change.
 */
export class RuleBasedEducationalRiskModel implements RiskAssessmentModel {
  readonly id = "rule-based-educational";
  readonly version = "1.0.0";
  readonly label = "AI-assisted educational risk assessment";
  readonly description =
    "Transparent rule-based scoring for education and awareness. Not calibrated to absolute cancer probability and not a diagnostic tool.";

  evaluate(input: RiskAssessmentInput): RiskAssessmentResult {
    const factors: RiskFactor[] = [];
    const maxScore = 160;

    /* ---------------- Family history ---------------- */
    const f = input.familyHistory;
    if (f.knownPathogenicVariant) {
      factors.push(
        factor(
          "fam.variant",
          "Known inherited gene change in the family",
          "Family history",
          30,
          "Inherited changes such as BRCA1, BRCA2 or PALB2 meaningfully raise lifetime risk. Genetic counselling is usually recommended.",
          "significant",
        ),
      );
    }
    if (f.firstDegreeRelativesWithBreastCancer > 0) {
      factors.push(
        factor(
          "fam.first-degree",
          `${f.firstDegreeRelativesWithBreastCancer} close relative(s) with breast cancer`,
          "Family history",
          8 + f.firstDegreeRelativesWithBreastCancer * 6,
          "Breast cancer in a mother, sister, daughter or father raises risk, particularly when more than one relative is affected.",
          f.firstDegreeRelativesWithBreastCancer > 1 ? "significant" : "notable",
        ),
      );
    }
    if (f.relativeDiagnosedBefore50) {
      factors.push(
        factor(
          "fam.early-onset",
          "A relative diagnosed before age 50",
          "Family history",
          10,
          "Diagnosis at a younger age in a close relative may point to an inherited pattern.",
          "notable",
        ),
      );
    }
    if (f.maleRelativeWithBreastCancer) {
      factors.push(
        factor(
          "fam.male",
          "Male relative with breast cancer",
          "Family history",
          10,
          "Breast cancer in a male relative is uncommon and is often discussed with a genetics service.",
          "notable",
        ),
      );
    }
    if (f.ovarianOrPancreaticCancerInFamily) {
      factors.push(
        factor(
          "fam.ovarian",
          "Ovarian or pancreatic cancer in the family",
          "Family history",
          8,
          "These cancers can share inherited risk patterns with breast cancer.",
          "notable",
        ),
      );
    }
    if (f.ashkenaziJewishAncestry) {
      factors.push(
        factor(
          "fam.ancestry",
          "Ashkenazi Jewish ancestry",
          "Family history",
          6,
          "Certain inherited gene changes are more common in people of Ashkenazi Jewish ancestry.",
          "informational",
        ),
      );
    }

    /* ---------------- Personal history ---------------- */
    const p = input.personalHistory;
    if (p.previousBreastCancer) {
      factors.push(
        factor(
          "per.previous",
          "Previous breast cancer",
          "Personal history",
          22,
          "A previous breast cancer diagnosis raises the chance of a new cancer in either breast; follow-up care is important.",
          "significant",
        ),
      );
    }
    if (p.atypicalHyperplasiaOrLcis) {
      factors.push(
        factor(
          "per.atypia",
          "Atypical hyperplasia or LCIS on a previous biopsy",
          "Personal history",
          18,
          "These biopsy findings are not cancer but are associated with a higher future risk and closer follow-up.",
          "significant",
        ),
      );
    }
    if (p.chestRadiationBeforeAge30) {
      factors.push(
        factor(
          "per.radiation",
          "Chest radiation before age 30",
          "Personal history",
          16,
          "Chest radiation at a young age — for example for lymphoma — increases later breast risk.",
          "significant",
        ),
      );
    }
    if (p.previousBenignBreastDisease) {
      factors.push(
        factor(
          "per.benign",
          "Previous benign breast condition",
          "Personal history",
          6,
          "Most benign breast conditions do not raise risk appreciably; a small number do.",
          "informational",
        ),
      );
    }
    if (p.otherCancerHistory) {
      factors.push(
        factor(
          "per.other-cancer",
          "Previous cancer of another type",
          "Personal history",
          6,
          "Some cancer histories share risk factors or inherited patterns with breast cancer.",
          "informational",
        ),
      );
    }

    /* ---------------- Reproductive & hormonal history ---------------- */
    const r = input.reproductiveHistory;
    if (r.menarcheBefore12) {
      factors.push(
        factor(
          "rep.early-menarche",
          "First period before age 12",
          "Hormonal history",
          4,
          "Earlier first periods mean a longer lifetime exposure to oestrogen.",
          "informational",
        ),
      );
    }
    if (r.menopauseAfter55) {
      factors.push(
        factor(
          "rep.late-menopause",
          "Menopause after age 55",
          "Hormonal history",
          4,
          "A later menopause extends lifetime oestrogen exposure.",
          "informational",
        ),
      );
    }
    if (r.firstLiveBirthAfter30) {
      factors.push(
        factor(
          "rep.late-first-birth",
          "First full-term pregnancy after age 30",
          "Hormonal history",
          4,
          "Age at first full-term pregnancy is one of many modest influences on risk.",
          "informational",
        ),
      );
    }
    if (r.neverGaveBirth) {
      factors.push(
        factor(
          "rep.nulliparous",
          "Never gave birth",
          "Hormonal history",
          4,
          "Not having children is associated with a small increase in risk.",
          "informational",
        ),
      );
    }
    if (r.currentHormoneTherapy || r.combinedHormoneTherapy) {
      factors.push(
        factor(
          "rep.hrt",
          "Current or past combined hormone therapy",
          "Hormonal history",
          10,
          "Combined hormone replacement therapy is associated with a modest increase in risk. Never stop a prescribed medicine without speaking to your prescriber.",
          "notable",
        ),
      );
    }
    if (r.neverBreastfed) {
      factors.push(
        factor(
          "rep.no-breastfeeding",
          "Never breastfed",
          "Hormonal history",
          2,
          "Breastfeeding is associated with a small reduction in risk; not breastfeeding does not mean your risk is high.",
          "informational",
        ),
      );
    }

    /* ---------------- Age & lifestyle ---------------- */
    if (input.age >= 70) {
      factors.push(factor("age.70", "Age 70 or over", "Age", 16, "Risk rises steadily with age.", "notable"));
    } else if (input.age >= 60) {
      factors.push(factor("age.60", "Age 60–69", "Age", 13, "Risk rises steadily with age.", "notable"));
    } else if (input.age >= 50) {
      factors.push(factor("age.50", "Age 50–59", "Age", 10, "Risk rises steadily with age.", "notable"));
    } else if (input.age >= 40) {
      factors.push(factor("age.40", "Age 40–49", "Age", 7, "Risk rises steadily with age.", "informational"));
    } else {
      factors.push(
        factor("age.under40", "Age under 40", "Age", 3, "Breast cancer is less common under 40 but still occurs.", "informational"),
      );
    }

    const l = input.lifestyle;
    if (l.bmi !== null && l.bmi >= 30 && l.postmenopausal) {
      factors.push(
        factor(
          "life.bmi",
          "BMI of 30 or above after menopause",
          "Lifestyle",
          8,
          "Weight management after menopause is one of the modifiable factors associated with breast risk.",
          "informational",
        ),
      );
    }
    if (l.alcoholUnitsPerWeek >= 14) {
      factors.push(
        factor(
          "life.alcohol-high",
          `${l.alcoholUnitsPerWeek} units of alcohol per week`,
          "Lifestyle",
          8,
          "Alcohol intake is a modifiable risk factor; guidelines generally advise keeping intake low.",
          "informational",
        ),
      );
    } else if (l.alcoholUnitsPerWeek >= 7) {
      factors.push(
        factor(
          "life.alcohol",
          `${l.alcoholUnitsPerWeek} units of alcohol per week`,
          "Lifestyle",
          4,
          "Even moderate alcohol intake is associated with a small increase in risk.",
          "informational",
        ),
      );
    }
    if (l.physicalActivity === "low") {
      factors.push(
        factor(
          "life.activity",
          "Low physical activity",
          "Lifestyle",
          4,
          "Regular activity is associated with a modest reduction in risk and supports treatment tolerance.",
          "informational",
        ),
      );
    }
    if (l.smokingStatus === "current") {
      factors.push(
        factor(
          "life.smoking",
          "Current smoking",
          "Lifestyle",
          4,
          "Smoking is associated with a small increase in breast cancer risk and affects surgical and treatment outcomes.",
          "informational",
        ),
      );
    }

    /* ---------------- Screening ---------------- */
    const s = input.screening;
    if (s.denseBreastTissue) {
      factors.push(
        factor(
          "screen.density",
          "Dense breast tissue",
          "Screening",
          8,
          "Dense tissue is common and can make mammograms harder to read; your team may discuss additional imaging.",
          "notable",
        ),
      );
    }
    if (!s.screeningUpToDate) {
      factors.push(
        factor(
          "screen.overdue",
          "Screening not up to date",
          "Screening",
          6,
          "Staying up to date with recommended screening is the most effective way to detect changes early.",
          "notable",
        ),
      );
    }
    if (s.lastMammogramMonthsAgo === null) {
      factors.push(
        factor(
          "screen.never",
          "No previous mammogram recorded",
          "Screening",
          6,
          "Discuss with your clinician whether and when screening is appropriate for you.",
          "notable",
        ),
      );
    }

    /* ---------------- Reported symptoms ---------------- */
    const redFlags: string[] = [];
    for (const symptom of input.symptoms) {
      const definition = symptomDefinition(symptom.code);
      if (!definition) continue;

      let points = definition.points;
      if (symptom.unilateral) points += 3;
      if (symptom.progressive) points += 5;
      if (symptom.severe) points += 3;
      if (symptom.durationWeeks >= 4) points += 3;

      factors.push(
        factor(
          `sym.${symptom.code}`,
          symptom.label,
          "Reported symptoms",
          points,
          definition.guidance,
          points >= 20 ? "significant" : "notable",
        ),
      );

      if (definition.redFlagPattern?.(symptom) && definition.redFlagText) {
        redFlags.push(definition.redFlagText);
      }
    }

    /* ---------------- Aggregate ---------------- */
    const rawScore = factors.reduce((sum, f) => sum + f.points, 0);
    const score = Math.min(rawScore, maxScore);
    const normalizedScore = normalizeScore(score, maxScore);
    const hasRedFlag = redFlags.length > 0;

    let level = levelForNormalized(normalizedScore);
    // A red-flag symptom always lifts the result to at least "moderate" so the guidance
    // recommends professional evaluation.
    if (hasRedFlag && level === "low") level = "moderate";

    const guidance = buildGuidance(level, hasRedFlag, input, redFlags);

    return {
      modelName: `${this.label} (${this.id} v${this.version})`,
      modelVersion: this.version,
      modelId: this.id,
      level,
      score,
      maxScore,
      normalizedScore: Number(normalizedScore.toFixed(4)),
      urgency: urgencyForLevel(level, hasRedFlag),
      factors: factors.sort((a, b) => b.points - a.points),
      guidance,
      redFlags: Array.from(new Set(redFlags)),
      disclaimers: BASE_DISCLAIMERS,
      evaluatedAt: new Date().toISOString(),
    };
  }
}

function buildGuidance(
  level: RiskLevel,
  hasRedFlag: boolean,
  input: RiskAssessmentInput,
  redFlags: string[],
): string[] {
  const guidance: string[] = [];

  if (hasRedFlag) {
    guidance.push(
      "Your responses indicate that professional medical evaluation may be appropriate. Please arrange an appointment with your doctor or breast clinic.",
    );
    guidance.push(...redFlags);
  }

  if (level === "high") {
    guidance.push(
      "Your answers indicate a higher-than-average combination of risk factors. This is an educational indicator only — it does not mean you have breast cancer.",
    );
    guidance.push(
      "Discuss with your clinician whether a personalised screening schedule, breast imaging, or a referral to a genetics or high-risk clinic would be appropriate.",
    );
  } else if (level === "moderate") {
    guidance.push(
      "Your answers indicate a moderate combination of risk factors. Many people in this range never develop breast cancer.",
    );
    guidance.push(
      "A conversation with your clinician about screening timing and modifiable factors would be a sensible next step.",
    );
  } else {
    guidance.push(
      "Your answers indicate a lower combination of the risk factors in this questionnaire. This does not rule out breast disease.",
    );
    guidance.push(
      "Continue routine screening appropriate for your age and region, and report any new or persistent breast change to a clinician.",
    );
  }

  const modifiable = input.lifestyle;
  if (modifiable.alcoholUnitsPerWeek > 0 || modifiable.physicalActivity === "low" || modifiable.smokingStatus === "current") {
    guidance.push(
      "Modifiable factors in your answers — alcohol, activity and smoking — are areas where small, sustainable changes are associated with lower risk. Your clinician can help you prioritise them safely.",
    );
  }

  if (input.familyHistory.knownPathogenicVariant || input.familyHistory.firstDegreeRelativesWithBreastCancer >= 2) {
    guidance.push(
      "Given your family history, ask your clinician whether a referral for genetic counselling is appropriate.",
    );
  }

  guidance.push(
    "Breast awareness matters: knowing how your breasts normally look and feel helps you notice changes early. This platform cannot examine you — a clinician can.",
  );

  return guidance;
}
